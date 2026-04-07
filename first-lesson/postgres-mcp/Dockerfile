FROM node:20-alpine

RUN npm install -g @modelcontextprotocol/server-postgres supergateway

EXPOSE 8096

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
