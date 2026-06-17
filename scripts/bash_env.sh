#!/bin/sh
# Digunakan oleh BASH_ENV agar artifact workflows mendapatkan PATH yang benar.
# File ini di-source otomatis oleh bash non-interactive shell.
PNPM_BIN="/nix/store/61lr9izijvg30pcribjdxgjxvh3bysp4-pnpm-10.26.1/bin"
NODE_BIN="/nix/store/jfar9wnj6kvr0gr6klh1gk7vgckkfr5j-nodejs-20.20.0/bin"
case ":${PATH}:" in
  *":${PNPM_BIN}:"*) ;;
  *) export PATH="${PNPM_BIN}:${NODE_BIN}:${PATH}" ;;
esac
