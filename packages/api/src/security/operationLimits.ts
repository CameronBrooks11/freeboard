/**
 * @module security/operationLimits
 * No-dependency GraphQL operation guards: caps query depth, alias count, and
 * total field-selection count so a single request can't amplify into an
 * expensive operation. Complements the request-body byte cap (which bounds bytes,
 * not operation shape). Registered as an envelop validation plugin so limits are
 * enforced during validation, before execution.
 *
 * The dashboard schema is shallow and non-recursive today, so the alias and node
 * caps are the substantive guards (alias amplification / flat breadth); the depth
 * cap is defense-in-depth for any future recursive field.
 *
 * minimal: AST-shape limits only — no field-cost weighting and the depth rule
 * does not descend through fragment spreads. If the schema gains expensive
 * resolvers or recursion, upgrade to graphql-armor (cost analysis, fragment-aware
 * depth) rather than growing these by hand.
 */

import { GraphQLError } from "graphql";
import type { ASTVisitor, ValidationContext, ValidationRule } from "graphql";
import type { Plugin } from "graphql-yoga";

/** Max nesting depth of field selections. Generous vs. the deepest real query. */
export const MAX_OPERATION_DEPTH = 15;
/** Max number of aliased fields in one operation (bounds alias amplification). */
export const MAX_OPERATION_ALIASES = 50;
/** Max total field selections in one operation (bounds flat breadth). */
export const MAX_OPERATION_NODES = 1000;

const limitError = (message: string, code: string) =>
  new GraphQLError(message, { extensions: { code } });

/** Reject operations whose field nesting exceeds `max` (fragment spreads aside). */
export const createMaxDepthRule =
  (max: number): ValidationRule =>
  (context: ValidationContext): ASTVisitor => {
    let depth = 0;
    let reported = false;
    return {
      Field: {
        enter() {
          depth += 1;
          if (depth > max && !reported) {
            reported = true;
            context.reportError(
              limitError(`Query exceeds the maximum depth of ${max}.`, "OPERATION_TOO_DEEP"),
            );
          }
        },
        leave() {
          depth -= 1;
        },
      },
    };
  };

/** Reject operations with more than `max` aliased fields. */
export const createMaxAliasesRule =
  (max: number): ValidationRule =>
  (context: ValidationContext): ASTVisitor => {
    let aliases = 0;
    let reported = false;
    return {
      Field(node) {
        if (!node.alias) {
          return;
        }
        aliases += 1;
        if (aliases > max && !reported) {
          reported = true;
          context.reportError(
            limitError(
              `Query exceeds the maximum of ${max} aliases.`,
              "OPERATION_TOO_MANY_ALIASES",
            ),
          );
        }
      },
    };
  };

/** Reject operations with more than `max` total field selections. */
export const createMaxNodesRule =
  (max: number): ValidationRule =>
  (context: ValidationContext): ASTVisitor => {
    let nodes = 0;
    let reported = false;
    return {
      Field() {
        nodes += 1;
        if (nodes > max && !reported) {
          reported = true;
          context.reportError(
            limitError(`Query exceeds the maximum of ${max} fields.`, "OPERATION_TOO_LARGE"),
          );
        }
      },
    };
  };

/** The operation-limit rules in one array, for `validate()` and tests. */
export const operationLimitRules: ValidationRule[] = [
  createMaxDepthRule(MAX_OPERATION_DEPTH),
  createMaxAliasesRule(MAX_OPERATION_ALIASES),
  createMaxNodesRule(MAX_OPERATION_NODES),
];

/** Envelop/Yoga plugin registering the operation-limit validation rules. */
export const useOperationLimits = (): Plugin => ({
  onValidate({ addValidationRule }) {
    for (const rule of operationLimitRules) {
      addValidationRule(rule);
    }
  },
});
