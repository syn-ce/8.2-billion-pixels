# Contains $SERVER
source .env

# TODO: use rsync instead of ssh to copy files
docker compose -f docker-compose-build.yml build
docker save nginx:prod | bzip2 | ssh $SERVER docker load
docker save flask-app:prod | bzip2 | ssh $SERVER docker load
scp docker-compose-prod.yml $SERVER:~/bipix/
ssh $SERVER "cd bipix; docker stack deploy -c <(docker compose --env-file ~/ENV/.env -f docker-compose-prod.yml config | sed -e '1!b' -e '/^name:/d') bipix"