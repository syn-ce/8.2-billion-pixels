# Contains $SERVER
source .env

docker compose -f docker-compose-build.yml build
docker save nginx:prod > nginx-prod.tar
docker save go-server:prod > go-server-prod.tar
rsync -vz docker-compose-prod.yml go-server-prod.tar nginx-prod.tar $SERVER:~/bipix/
rm nginx-prod.tar
rm go-server-prod.tar
ssh $SERVER "cd bipix; docker load -i nginx-prod.tar; docker load -i go-server-prod.tar; docker stack deploy -c <(docker compose --env-file ~/ENV/.env -f docker-compose-prod.yml config | sed -e '1!b' -e '/^name:/d') bipix"