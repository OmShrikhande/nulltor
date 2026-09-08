FROM alpine:latest

# Install GCC, G++, libc-dev, musl-dev, and make for C/C++ compilation
RUN apk add --no-cache gcc g++ musl-dev libc-dev make

WORKDIR /code
CMD ["sh"]
