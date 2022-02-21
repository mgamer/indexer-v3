export const config = {
  version: String(process.env.VERSION),
  port: Number(process.env.PORT),
  chainId: Number(process.env.CHAIN_ID),

  adminApiKey: String(process.env.ADMIN_API_KEY),
  arweaveRelayerKey: process.env.ARWEAVE_RELAYER_KEY
    ? String(process.env.ARWEAVE_RELAYER_KEY)
    : undefined,

  baseNetworkHttpUrl: String(process.env.BASE_NETWORK_HTTP_URL),
  metadataApiBaseUrl: String(process.env.METADATA_API_BASE_URL),

  databaseUrl: String(process.env.DATABASE_URL),
  redisUrl: String(process.env.REDIS_URL),

  catchup: Boolean(Number(process.env.CATCHUP)),
  doBackgroundWork: Boolean(Number(process.env.DO_BACKGROUND_WORK)),
};
