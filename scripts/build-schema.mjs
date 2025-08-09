import { writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { printSchema } from 'graphql';

const __dirname = dirname(fileURLToPath(import.meta.url));

// import your GraphQLSchema from ESM
const schemaFile = resolve(__dirname, '../packages/api/src/gql.js');
const mod = await import(pathToFileURL(schemaFile).href);
const schema = mod.default || mod.schema;
if (!schema) throw new Error('No GraphQLSchema export found from packages/api/src/gql.js');

// write SDL
const out = resolve(__dirname, '../docs/auto/graphql/schema.graphql');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, printSchema(schema), 'utf8');
console.log(`✅ Wrote ${out}`);
