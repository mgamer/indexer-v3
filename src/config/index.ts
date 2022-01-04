export const config = {
  version: String(process.env.VERSION),
  port: Number(process.env.PORT),
  chainId: Number(process.env.CHAIN_ID),

  adminApiKey: String(process.env.ADMIN_API_KEY),

  metadataApiBaseUrl: String(process.env.METADATA_API_BASE_URL),

  baseNetworkHttpUrl: String(process.env.BASE_NETWORK_HTTP_URL),
  orderbookNetworkHttlUrl: String(process.env.ORDERBOOK_NETWORK_HTTP_URL),

  databaseUrl: String(process.env.DATABASE_URL),
  redisUrl: String(process.env.REDIS_URL),

  acceptOrders: Boolean(process.env.ACCEPT_ORDERS),
  doBackgroundWork: Boolean(process.env.DO_BACKGROUND_WORK),
};
