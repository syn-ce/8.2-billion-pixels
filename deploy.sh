# Contains $SERVER
source .env

docker compose -f docker-compose-build.yml build
docker save nginx:prod > nginx-prod.tar
docker save go-server:prod > go-server-prod.tar
rsync -vz docker-compose-prod.yml go-server-prod.tar nginx-prod.tar $SERVER:~/bipix/
rm nginx-prod.tar
rm go-server-prod.tar
# docker compose config substitutes environment variables in the dockerc-compose file using the specified env file (docker stack doesn't, 
# which is why we need compose here). However, for some reason, its output starts with the name of the project in the first line (followed
# by the services). If passed directly to docker stack deploy, Docker will complain about this first unexpected line, meaning we have to 
# remove it (despite config advertising as "Parse, resolve and render compose file in canonical format" - perhaps I missed something). This 
# is what sed does here: It checks whether the first line starts with "name:" and removes it if it does. We could perhaps get away with 
# simply removing the first line without checking, but I didn't feel comfortable relying on this rather odd seeming behavior.
ssh $SERVER "cd bipix; docker load -i nginx-prod.tar; docker load -i go-server-prod.tar; docker stack deploy -c <(docker compose --env-file ~/ENV/.env -f docker-compose-prod.yml config | sed -e '1!b' -e '/^name:/d') bipix"