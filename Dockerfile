FROM node:16.13-slim

ARG DATABASE_URL
ARG PORT

EXPOSE ${PORT}

WORKDIR /indexer-v3
ADD . /indexer-v3
RUN yarn install
RUN yarn build
CMD yarn start