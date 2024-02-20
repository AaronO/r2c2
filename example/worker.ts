import { serveR2C2 } from '../src';

export interface Env {
  R2C2_ENAM?: R2Bucket;
  R2C2_WNAM?: R2Bucket;
  R2C2_APAC?: R2Bucket;
  R2C2_WEUR?: R2Bucket;
  R2C2_EEUR?: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const r2c2 = {
      apac: env.R2C2_APAC,
      eeur: env.R2C2_EEUR,
      enam: env.R2C2_ENAM,
      weur: env.R2C2_WEUR,
      wnam: env.R2C2_WNAM,
    };
    // Example: be nice :)
    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405 });
    }
    return serveR2C2(r2c2, request, {
      ttl: () => 3600,
      ctx,
    });
  },
};
