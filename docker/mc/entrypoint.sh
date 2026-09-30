#!/bin/sh
# Seeds server.properties on first start and ops the configured players.
# In offline mode the server converts ops.txt names to offline UUIDs at startup.
set -e
cd /etc/minecraft
[ -f server.properties ] || cp /opt/blueprint/server.properties server.properties
[ -f eula.txt ] || echo "eula=true" > eula.txt
if [ -n "$OPS" ] && [ ! -f ops.json ]; then
  echo "$OPS" | tr ',' '\n' > ops.txt
fi
exec java ${JAVA_OPTS:--Xms512M -Xmx2G} -jar /opt/minecraft/minecraft_server.jar nogui
