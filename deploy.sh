# Contains $SERVER
source .env

docker compose -f docker-compose-build.yml build
docker save nginx:prod > nginx-prod.tar
docker save flask-app:prod > flask-app-prod.tar
rsync -z --info=progress2 docker-compose-prod.yml flask-app-prod.tar nginx-prod.tar $SERVER:~/bipix/
rm nginx-prod.tar
rm flask-app-prod.tar
ssh $SERVER "cd bipix; docker load -i nginx-prod.tar; docker load -i flask-app-prod.tar; docker stack deploy -c <(docker compose --env-file ~/ENV/.env -f docker-compose-prod.yml config | sed -e '1!b' -e '/^name:/d') bipix"