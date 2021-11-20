export const config = {
  port: Number(process.env.PORT),
  chainId: Number(process.env.CHAIN_ID),

  adminApiKey: String(process.env.ADMIN_API_KEY),

  baseNetworkHttpUrl: String(process.env.BASE_NETWORK_HTTP_URL),

  databaseUrl: String(process.env.DATABASE_URL),
  redisUrl: String(process.env.REDIS_URL),

  doBackgroundWork: Boolean(process.env.DO_BACKGROUND_WORK),
};
