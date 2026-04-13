import Anthropic from '@anthropic-ai/sdk';

// Lazy-initialized shared Anthropic SDK instance.
// Must be lazy because dotenv.config() may run after module imports in CJS mode.
let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic();
  }
  return _client;
}

export const MODEL = 'claude-sonnet-4-20250514';

// Default export is a proxy that lazily creates the client on first property access
const client = new Proxy({} as Anthropic, {
  get(_target, prop) {
    return (getClient() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export default client;
