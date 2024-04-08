import { SerializedError } from '@reduxjs/toolkit';
import { BaseQueryFn } from '@reduxjs/toolkit/query';
import { getFetchClient, ApiError, FetchConfig } from '@strapi/strapi/admin';
import { isAxiosError, type AxiosRequestConfig } from 'axios';

/* -------------------------------------------------------------------------------------------------
 * Axios data
 * -----------------------------------------------------------------------------------------------*/
export interface QueryArguments {
  url: string;
  method?: string;
  data?: unknown;
  config?: FetchConfig;
}

export interface UnknownApiError {
  name: 'UnknownError';
  message: string;
  details?: unknown;
  status?: number;
}

export type BaseQueryError = ApiError | UnknownApiError;

const axiosBaseQuery =
  (config: FetchConfig): BaseQueryFn<string | QueryArguments, unknown, BaseQueryError> =>
  async (query, { signal }) => {
    try {
      const { get, post, del, put } = getFetchClient(config);

      if (typeof query === 'string') {
        const result = await get(query, { fetchConfig: { signal } });
        return { data: result.data };
      } else {
        const { url, method = 'GET', data, config } = query;

        if (method === 'POST') {
          const result = await post(url, data, {
            options: { ...config?.options },
            fetchConfig: { ...config?.fetchConfig, signal },
          });
          return { data: result.data };
        }

        if (method === 'DELETE') {
          const result = await del(url, {
            options: { ...config?.options },
            fetchConfig: { ...config?.fetchConfig, signal },
          });
          return { data: result.data };
        }

        if (method === 'PUT') {
          const result = await put(url, data, {
            options: { ...config?.options },
            fetchConfig: { ...config?.fetchConfig, signal },
          });
          return { data: result.data };
        }

        /**
         * Default is GET.
         */
        const result = await get(url, {
          options: { ...config?.options },
          fetchConfig: { ...config?.fetchConfig, signal },
        });
        return { data: result.data };
      }
    } catch (err) {
      /**
       * Handle error of type AxiosError
       *
       * This format mimics what we want from an AxiosError which is what the
       * rest of the app works with, except this format is "serializable" since
       * it goes into the redux store.
       *
       * NOTE – passing the whole response will highlight this "serializability" issue.
       */

      if (isAxiosError(err)) {
        if (
          typeof err.response?.data === 'object' &&
          err.response?.data !== null &&
          'error' in err.response?.data
        ) {
          /**
           * This will most likely be ApiError
           */
          return { data: undefined, error: err.response?.data.error };
        } else {
          return {
            data: undefined,
            error: {
              name: 'UnknownError',
              message: 'There was an unknown error response from the API',
              details: err.response?.data,
              status: err.response?.status,
            } as UnknownApiError,
          };
        }
      }

      const error = err as Error;
      return {
        data: undefined,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        } satisfies SerializedError,
      };
    }
  };

const isBaseQueryError = (error: BaseQueryError | SerializedError): error is BaseQueryError => {
  return error.name !== undefined;
};

export { axiosBaseQuery, isBaseQueryError };
