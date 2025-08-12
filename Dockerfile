FROM node:20-alpine

WORKDIR /app

# Clone repo and install dependencies in one layer to reduce image size
RUN apk add --no-cache git && \
    git clone https://github.com/KING-DAVIDX/Queen_Alya.git . && \
    npm install && \
    npm cache clean --force && \
    apk del git

EXPOSE 3000
CMD ["npm", "start"]