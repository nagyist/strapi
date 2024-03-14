import type { Strapi } from '@strapi/strapi';

import { getService } from './utils';

const registerModelsHooks = () => {
  strapi.db.lifecycles.subscribe({
    models: ['plugin::i18n.locale'],

    async afterCreate() {
      await getService('permissions').actions.syncSuperAdminPermissionsWithLocales();
    },

    async afterDelete() {
      await getService('permissions').actions.syncSuperAdminPermissionsWithLocales();
    },
  });

  strapi.documents.use(async (context, next) => {
    // @ts-expect-error ContentType is not typed correctly on the context
    const schema = context.contentType;

    if (!['create', 'update', 'discardDraft', 'publish'].includes(context.action)) {
      return next(context);
    }

    if (!getService('content-types').isLocalizedContentType(schema)) {
      return next(context);
    }

    // Collect the result of the document service action and sync non localized
    // attributes based on the response

    // Build a populate array for all non localized fields within the schema
    const { getNestedPopulateOfNonLocalizedAttributes, getNonLocalizedAttributes } =
      getService('content-types');

    const nonLocalizedAttributes = getNonLocalizedAttributes(schema);
    const attributesToPopulate = [
      ...nonLocalizedAttributes,
      ...getNestedPopulateOfNonLocalizedAttributes(schema.uid),
    ];

    // Get the result of the document service action
    const result = (await next(context)) as any;

    // We may not have received a result with everything populated that we need
    // Use the id and populate built from non localized fields to get the full
    // result
    let resultID;
    if (result.versions) {
      resultID = result.versions[0].id;
    } else {
      resultID = result.id;
    }
    const populatedResult = await strapi.db
      .query(schema.uid)
      .findOne({ where: { id: resultID }, populate: attributesToPopulate });

    await getService('localizations').syncNonLocalizedAttributes(populatedResult, schema);

    return result;
  });
};

export default async ({ strapi }: { strapi: Strapi }) => {
  const { sendDidInitializeEvent } = getService('metrics');
  const { decorator } = getService('entity-service-decorator');
  const { initDefaultLocale } = getService('locales');
  const { sectionsBuilder, actions, engine } = getService('permissions');

  // TODO: v5 handled in the document service or via document service middlewares
  // Entity Service
  (strapi.entityService as any).decorate(decorator);

  // Data
  await initDefaultLocale();

  // Sections Builder
  sectionsBuilder.registerLocalesPropertyHandler();

  // Actions
  await actions.registerI18nActions();
  actions.registerI18nActionsHooks();
  actions.updateActionsProperties();

  // Engine/Permissions
  engine.registerI18nPermissionsHandlers();

  // Hooks & Models
  registerModelsHooks();

  sendDidInitializeEvent();
};
