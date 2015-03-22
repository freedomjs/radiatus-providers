# Dockerfile for a launching the radiatus-providers web server
FROM freedomjs/freedom
MAINTAINER Raymond Cheng <ryscheng@cs.washington.edu>

ADD ./ /radiatus-providers
WORKDIR /radiatus-providers
RUN npm install

# ENTRYPOINT [ "npm start" ]
