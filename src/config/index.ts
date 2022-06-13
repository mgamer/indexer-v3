export const config = {
  version: String(process.env.VERSION),
  port: Number(process.env.PORT),
  chainId: Number(process.env.CHAIN_ID),

  adminApiKey: String(process.env.ADMIN_API_KEY),
  arweaveRelayerKey: process.env.ARWEAVE_RELAYER_KEY
    ? String(process.env.ARWEAVE_RELAYER_KEY)
    : undefined,
  oraclePrivateKey: process.env.ORACLE_PRIVATE_KEY
    ? String(process.env.ORACLE_PRIVATE_KEY)
    : undefined,

  baseNetworkHttpUrl: String(process.env.BASE_NETWORK_HTTP_URL),
  baseNetworkWsUrl: String(process.env.BASE_NETWORK_WS_URL),
  openseaIndexerApiBaseUrl: String(process.env.OPENSEA_INDEXER_API_BASE_URL),

  // When running in liquidity-only mode, all metadata processes are disabled
  liquidityOnly: !process.env.METADATA_API_BASE_URL,
  metadataApiBaseUrl: String(process.env.METADATA_API_BASE_URL),

  databaseUrl: String(process.env.DATABASE_URL),
  readReplicaDatabaseUrl: String(process.env.READ_REPLICA_DATABASE_URL || process.env.DATABASE_URL),
  redisUrl: String(process.env.REDIS_URL),

  master: Boolean(Number(process.env.MASTER)),
  catchup: Boolean(Number(process.env.CATCHUP)),
  doBackgroundWork: Boolean(Number(process.env.DO_BACKGROUND_WORK)),
  disableOrders: Boolean(Number(process.env.DISABLE_ORDERS)),

  s3ExportAwsAccessKeyId: String(process.env.S3_EXPORT_AWS_ACCESS_KEY_ID),
  s3ExportAwsSecretAccessKey: String(process.env.S3_EXPORT_AWS_SECRET_ACCESS_KEY),
  s3ExportBucketName: String(process.env.S3_EXPORT_BUCKET_NAME),
};
