FROM        node:16-alpine AS deps

RUN         apk add --no-cache libc6-compat

WORKDIR     /app

COPY        package.json  package-lock.json*  ./

RUN         npm ci


FROM        node:16-alpine AS builder

WORKDIR     /app

COPY        --from=deps /app/node_modules ./node_modules

COPY        . .

RUN         npm install -g npm-check-updates

ENTRYPOINT  ["npm-check-updates"]
