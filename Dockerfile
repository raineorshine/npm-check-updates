FROM node:lts-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1

RUN npm install -g npm-check-updates

WORKDIR /app

ENTRYPOINT ["npm-check-updates"]
