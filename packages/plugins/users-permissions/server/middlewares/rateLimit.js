'use strict';

const utils = require('@strapi/utils');
const { has, toLower } = require('lodash/fp');

const { RateLimitError } = utils.errors;

module.exports =
  (config, { strapi }) =>
  async (ctx, next) => {
    let rateLimitConfig = strapi.config.get('plugin.users-permissions.ratelimit');

    if (!rateLimitConfig) {
      rateLimitConfig = {
        enabled: true,
      };
    }

    if (!has('enabled', rateLimitConfig)) {
      rateLimitConfig.enabled = true;
    }

    if (rateLimitConfig.enabled === true) {
      const rateLimit = require('koa2-ratelimit').RateLimit;

      const userIdentifier = toLower(ctx.request.body.email) || 'unknownIdentifier';
      const requestPath = toLower(ctx.request.path) || 'unknownPath';

      const loadConfig = {
        interval: { min: 5 },
        max: 5,
        prefixKey: `${userIdentifier}:${requestPath}:${ctx.request.ip}`,
        handler() {
          throw new RateLimitError();
        },
        ...rateLimitConfig,
        ...config,
      };

      return rateLimit.middleware(loadConfig)(ctx, next);
    }

    return next();
  };
