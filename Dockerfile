FROM node:20

# copy over necessary files and install libraries
WORKDIR /usr/src/app
COPY . .
RUN npm install

# expose port and run app
EXPOSE 443
CMD ["node", "index.js"]