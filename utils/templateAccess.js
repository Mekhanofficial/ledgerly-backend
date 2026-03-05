const templateCatalog = require('../data/templates');
const TemplatePurchase = require('../models/TemplatePurchase');
const UserTemplateUnlock = require('../models/UserTemplateUnlock');
const {
  TEMPLATE_BUNDLE_ID,
  TEMPLATE_BUNDLE_IDS,
  FREE_TEMPLATE_IDS,
  normalizeTemplateCategory,
  isTemplateIncludedInPlan
} = require('./planConfig');
const { resolveBillingOwner, resolveEffectivePlan } = require('./subscriptionService');

const TEMPLATE_STYLE_ALIASES = {
  modern: 'modernCorporate',
  clean: 'cleanBilling',
  retail: 'retailReceipt',
  elegant: 'simpleElegant',
  urban: 'urbanEdge',
  creative: 'creativeFlow',
  professionalclassic: 'professionalClassic',
  moderncorporate: 'modernCorporate',
  cleanbilling: 'cleanBilling',
  retailreceipt: 'retailReceipt',
  simpleelegant: 'simpleElegant',
  urbanedge: 'urbanEdge',
  creativeflow: 'creativeFlow',
  neobrutalist: 'neoBrutalist',
  minimaldark: 'minimalistDark',
  minimalistdark: 'minimalistDark',
  organiceco: 'organicEco',
  corporatpro: 'corporatePro',
  corporatestyle: 'corporatePro',
  creativestudio: 'creativeStudio',
  techmodern: 'techModern'
};

const normalizeTemplateValue = (value) => String(value || '').trim();

const normalizeTemplateLookupValue = (value) => {
  const normalized = normalizeTemplateValue(value).toLowerCase();
  if (!normalized) return '';
  const aliased = TEMPLATE_STYLE_ALIASES[normalized] || normalized;
  return normalizeTemplateValue(aliased).toLowerCase();
};

const buildTemplateLookupMap = (templates) => {
  const lookup = new Map();
  templates.forEach((template) => {
    const idKey = normalizeTemplateLookupValue(template.id);
    const styleKey = normalizeTemplateLookupValue(template.templateStyle);
    if (idKey) lookup.set(idKey, template.id);
    if (styleKey) lookup.set(styleKey, template.id);
  });
  return lookup;
};

const resolveCanonicalTemplateId = (input, templateLookup, fallback = 'standard') => {
  const key = normalizeTemplateLookupValue(input);
  if (key && templateLookup.has(key)) {
    return templateLookup.get(key);
  }

  const fallbackKey = normalizeTemplateLookupValue(fallback);
  if (fallbackKey && templateLookup.has(fallbackKey)) {
    return templateLookup.get(fallbackKey);
  }

  return 'standard';
};

const resolveBusinessTemplateContext = async ({ businessId, billingOwner }) => {
  const owner = billingOwner || await resolveBillingOwner({ business: businessId });
  const planId = resolveEffectivePlan(owner);

  const [legacyPurchases, unlocks] = await Promise.all([
    TemplatePurchase.find({
      business: businessId,
      status: 'completed'
    }).select('templateId').lean(),
    UserTemplateUnlock.find({
      business: businessId
    }).select('templateId unlockAllTemplates').lean()
  ]);

  const purchaseMap = new Set([
    ...legacyPurchases.map((purchase) => purchase.templateId),
    ...unlocks.filter((unlock) => unlock.templateId).map((unlock) => unlock.templateId)
  ]);
  if (owner?.purchasedTemplates?.length) {
    owner.purchasedTemplates.forEach((templateId) => purchaseMap.add(templateId));
  }

  const hasBundle = unlocks.some((unlock) => unlock.unlockAllTemplates || unlock.templateId === TEMPLATE_BUNDLE_ID)
    || purchaseMap.has(TEMPLATE_BUNDLE_ID)
    || Boolean(owner?.hasLifetimeTemplates);
  const hasPremiumBundle = unlocks.some((unlock) => unlock.templateId === TEMPLATE_BUNDLE_IDS.PREMIUM)
    || purchaseMap.has(TEMPLATE_BUNDLE_IDS.PREMIUM);
  const hasEliteBundle = unlocks.some((unlock) => unlock.templateId === TEMPLATE_BUNDLE_IDS.ELITE)
    || purchaseMap.has(TEMPLATE_BUNDLE_IDS.ELITE);

  const templates = templateCatalog
    .filter((template) => template.isActive !== false)
    .map((template) => {
      const category = normalizeTemplateCategory(template.category);
      const templateId = template.id;
      const isFree = Boolean(template.isFree) || FREE_TEMPLATE_IDS.has(templateId);
      const includedInPlan = isTemplateIncludedInPlan(template, planId);
      const hasPurchase = purchaseMap.has(templateId);
      const hasTierBundle = (
        (category === 'PREMIUM' && hasPremiumBundle)
        || (category === 'ELITE' && hasEliteBundle)
      );
      const hasAccess = isFree || hasBundle || hasTierBundle || includedInPlan || hasPurchase;

      return {
        id: template.id,
        name: template.name,
        category,
        templateStyle: template.templateStyle || template.id,
        hasAccess,
        isFree,
        includedInPlan,
        hasPurchase,
        previewColor: template.previewColor || ''
      };
    });

  const templateLookup = buildTemplateLookupMap(templates);
  const accessibleTemplateIds = new Set(
    templates
      .filter((template) => template.hasAccess)
      .map((template) => template.id)
  );

  return {
    planId,
    templates,
    templateLookup,
    accessibleTemplateIds
  };
};

const resolvePartnerAllowedTemplateIds = (partner, templateContext) => {
  const accessible = templateContext.accessibleTemplateIds;
  if (partner?.allowAllTemplates) {
    return Array.from(accessible);
  }

  const configured = Array.isArray(partner?.allowedTemplateIds) ? partner.allowedTemplateIds : [];
  const normalizedConfigured = configured
    .map((templateId) => resolveCanonicalTemplateId(templateId, templateContext.templateLookup))
    .filter((templateId) => accessible.has(templateId));

  if (normalizedConfigured.length > 0) {
    return Array.from(new Set(normalizedConfigured));
  }

  if (accessible.has('standard')) {
    return ['standard'];
  }

  const [firstAccessible] = Array.from(accessible);
  return firstAccessible ? [firstAccessible] : [];
};

module.exports = {
  normalizeTemplateLookupValue,
  resolveCanonicalTemplateId,
  resolveBusinessTemplateContext,
  resolvePartnerAllowedTemplateIds
};
