# Offline-mode vanilla test server for Blueprint.
# Pinned to 26.1.1: protocol 775, the same protocol as 26.1, the newest version
# mineflayer 4.39 lists as tested. The base image ships the server jar baked in,
# so no download happens at container start.
FROM phlak/minecraft:26.1.1

USER root
COPY server.properties /opt/blueprint/server.properties
COPY entrypoint.sh /opt/blueprint/entrypoint.sh
RUN chmod +x /opt/blueprint/entrypoint.sh
USER minecraft

ENV OPS=Blueprint
EXPOSE 25565
ENTRYPOINT ["/opt/blueprint/entrypoint.sh"]
