'use strict';

const { createStrapiInstance } = require('api-tests/strapi');
const { createTestBuilder } = require('api-tests/builder');
const { createContentAPIRequest } = require('api-tests/request');

const builder = createTestBuilder();
let strapi;
let rq;
let data;

const productFixtures = [
  {
    name: 'foo',
    description: 'first product',
  },
  {
    name: 'bar',
    description: 'second product',
  },
];

const product = {
  attributes: {
    name: { type: 'string' },
    description: { type: 'text' },
  },
  displayName: 'product',
  singularName: 'product',
  pluralName: 'products',
  description: '',
  collectionName: '',
};

describe('Validate Body', () => {
  beforeAll(async () => {
    await builder
      .addContentType(product)
      .addFixtures(product.singularName, productFixtures)
      .build();

    data = builder.fixturesFor(product.singularName);

    strapi = await createStrapiInstance();
    rq = await createContentAPIRequest({ strapi });
  });

  afterAll(async () => {
    await strapi.destroy();
    await builder.cleanup();
  });

  describe('Create', () => {
    test('Cannot specify the ID during entity creation', async () => {
      const createPayload = { data: { id: -1, name: 'baz', description: 'third product' } };

      const response = await rq.post('/products', { body: createPayload });

      expect(response.statusCode).toBe(200);

      const { id, attributes } = response.body.data;

      expect(id).not.toBe(createPayload.data.id);

      expect(attributes).toHaveProperty('name', createPayload.data.name);
      expect(attributes).toHaveProperty('description', createPayload.data.description);
    });
  });

  describe('Update', () => {
    test('ID cannot be updated, but allowed fields can', async () => {
      const target = data[0];

      const updatePayload = { data: { id: -1, name: 'baz' } };

      const response = await rq.put(`/products/${target.id}`, {
        body: updatePayload,
      });

      expect(response.statusCode).toBe(200);

      const { id, attributes } = response.body.data;

      expect(id).toBe(target.id);
      expect(attributes).toHaveProperty('name', updatePayload.data.name);
      expect(attributes).toHaveProperty('description', target.description);
    });
  });
});
