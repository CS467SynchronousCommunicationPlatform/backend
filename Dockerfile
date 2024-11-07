FROM node:20

# copy over necessary files and install libraries
WORKDIR /usr/src/app
COPY .env ./
COPY package.json ./
COPY index.js ./
RUN npm install

# expose port and run app
EXPOSE 8000
CMD ["node", "index.js"]