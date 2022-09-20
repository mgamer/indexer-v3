
curl -X POST -H 'Content-Type: application/json' \
 -H 'X-Admin-Api-Key: admin' \
 -d '{"fromBlock": 14796587, "toBlock": 14796587}' \
http://localhost:3000/admin/sync-events \

curl -X POST -H 'Content-Type: application/json' \
 -H 'X-Admin-Api-Key: admin' \
 -d '{"fromBlock": 15536865, "toBlock": 15536865}' \
http://localhost:3000/admin/sync-events \

curl -X POST -H 'Content-Type: application/json' \
 -H 'X-Admin-Api-Key: admin' \
 -d '{"fromBlock": 14594725, "toBlock": 14594725}' \
http://localhost:3000/admin/sync-events \

curl -X POST -H 'Content-Type: application/json' \
 -H 'X-Admin-Api-Key: admin' \
 -d '{"fromBlock": 15536915, "toBlock": 15536915}' \
http://localhost:3000/admin/sync-events \

