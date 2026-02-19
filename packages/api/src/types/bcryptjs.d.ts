declare module "bcryptjs" {
  export function compare(value: string, hash: string): Promise<boolean>;
  export function genSalt(callback: (err: Error | undefined, salt: string) => void): void;
  export function hash(
    value: string,
    salt: string,
    callback: (err: Error | undefined, hash: string) => void,
  ): void;
  export function compare(
    value: string,
    hash: string,
    callback: (err: Error | undefined, result: boolean) => void,
  ): void;
}
