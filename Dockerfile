# Dockerfile for a launching the radiatus-providers web server

FROM node:0.10
MAINTAINER Raymond Cheng <ryscheng@cs.washington.edu>

# RUN npm install -g grunt-cli
# RUN npm install -g gulp

ADD ./ /radiatus-providers
WORKDIR /radiatus-providers
RUN npm install

ENTRYPOINT [ "npm start" ]

