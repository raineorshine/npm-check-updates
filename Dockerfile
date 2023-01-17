FROM        node:16-alpine AS deps

WORKDIR     /app

COPY        package.json  package-lock.json ./

RUN         npm install -g npm-check-updates

FROM        node:16-alpine AS builder

WORKDIR     /app

COPY        . .

ENTRYPOINT  ["npm-check-updates"]
