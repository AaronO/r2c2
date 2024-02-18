import { reqLocation, LocationHint } from './location';

// How to fallback if no location hint or bucket in desired region
const FALLBACK_ORDER: LocationHint[] = ['enam', 'wnam', 'apac', 'weur', 'eeur'];

// One must be non-empty
export type R2C2 = Record<LocationHint, R2Bucket | undefined>;

export function nearestR2(r2c2: R2C2, req: Request): R2Bucket {
  const location = reqLocation(req);
  if (location && r2c2[location] !== undefined) {
    return r2c2[location]!;
  }
  const fallback = FALLBACK_ORDER.find((region) => r2c2[region]);
  if (fallback) {
    return r2c2[fallback]!;
  }
  throw new Error('No bucket found');
}

function allR2(r2c2: R2C2): R2Bucket[] {
  return FALLBACK_ORDER.map((region) => r2c2[region]!).filter(Boolean);
}

export interface R2C2Config {
  cache?: Cache;
  ttl?: (req: Request) => number;
  c2Key?: (req: Request) => string | Request;
  r2Key?: (req: Request) => string;
  ctx?: ExecutionContext;
}

function defaultR2Key(req: Request): string {
  const url = new URL(req.url);
  return url.pathname.slice(1);
}

function defaultC2Key(req: Request): Request {
  return req;
}

export async function serveR2C2(r2c2: R2C2, req: Request, conf?: R2C2Config): Promise<Response> {
  const c2Key = conf?.c2Key ? conf.c2Key(req) : defaultC2Key(req);
  const r2Key = conf?.r2Key ? conf.r2Key(req) : defaultR2Key(req);
  const cache = conf?.cache ?? caches.default;
  const ttl = conf?.ttl ?? (() => 0);

  switch (req.method) {
    case 'PUT':
      const buckets = allR2(r2c2);
      // Propagate writes to all buckets in parallel
      const puts = buckets.reduce(
        (accu, b, i) => {
          const isLast = i === buckets.length - 1;
          const [body1, body2] = accu.body === null || isLast ? [accu.body, null] : accu.body!.tee();
          return { body: body2, promises: [...accu.promises, b.put(r2Key, body1 as ReadableStream)] };
        },
        { body: req.body, promises: [] } as { body?: ReadableStream | null; promises: Promise<any>[] }
      );
      await Promise.all(puts.promises);
      // Invalidate cache
      if (conf?.ctx) {
        conf.ctx.waitUntil(cache.delete(c2Key));
      } else {
        await cache.delete(c2Key);
      }
      return new Response(`Put ${r2Key} successfully!`);
    case 'GET':
      // Attempt to fetch from cache first
      const cachedResponse = await cache.match(c2Key);
      if (cachedResponse) {
        return cachedResponse;
      }

      // On cache miss, lookup in nearest bucket
      const nearestBucket = nearestR2(r2c2, req);
      const object = await nearestBucket.get(r2Key);

      if (object === null) {
        return new Response('Object Not Found', { status: 404 });
      }

      const ottl = ttl(req);
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);
      if (ottl > 0) {
        headers.set('Cache-Control', `public, max-age=${ottl}`);
      }

      const response = new Response(object.body, { headers });

      // Cache the response
      if (ottl > 0) {
        if (conf?.ctx) {
          conf.ctx.waitUntil(cache.put(c2Key, response.clone()));
        } else {
          await cache.put(c2Key, response.clone());
        }
      }

      return response;
    case 'DELETE':
      // Propagate deletes to all buckets in parallel
      await Promise.all(allR2(r2c2).map((b) => b.delete(r2Key)));
      // Invalidate cache
      await cache.delete(c2Key);
      return new Response('Deleted!');

    default:
      return new Response('Method Not Allowed', {
        status: 405,
        headers: {
          Allow: 'PUT, GET, DELETE',
        },
      });
  }
}
