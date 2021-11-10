FROM node:15.14-slim

ARG DATABASE_URL
ARG PORT

EXPOSE ${PORT}

WORKDIR /indexer-v3
ADD . /indexer-v3
RUN yarn install
RUN yarn build
CMD yarn start