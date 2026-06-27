FROM node:lts-alpine

RUN npm install -g npm-check-updates

WORKDIR /app

ENTRYPOINT ["npm-check-updates"]
