# Integration Test

### Run Local Fork
``` bash
npx hardhat node --fork http://localhost:8961
```

### Indexer

Update .env
```
IS_DEV=1
BASE_NETWORK_HTTP_URL=http://127.0.0.1:8545
```

Start Server
``` bash
yarn dev
```

### Run Test
```bash
yarn test test/sdk/looks-rare-v2/integration.test.ts --network localhost
```