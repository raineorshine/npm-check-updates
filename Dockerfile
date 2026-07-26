FROM node:lts-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd

RUN npm install -g npm-check-updates

WORKDIR /app

ENTRYPOINT ["npm-check-updates"]
