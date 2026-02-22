const templates = [
  {
    id: 'standard',
    name: 'Standard',
    description: 'Clean, professional design for all businesses',
    colors: {
      primary: [41, 128, 185],
      secondary: [52, 152, 219],
      accent: [236, 240, 241],
      text: [44, 62, 80]
    },
    fonts: {
      title: 'helvetica',
      body: 'helvetica',
      accent: 'helvetica'
    },
    layout: {
      showLogo: false,
      showWatermark: false,
      showHeaderBorder: true,
      showFooter: true,
      hasAnimations: false,
      hasGradientEffects: false,
      hasMultiLanguage: false
    },
    category: 'STANDARD',
    isPremium: false,
    isFree: true,
    isDefault: true,
    price: 5,
    isActive: true,
    previewImage: '',
    isIncludedInStarter: true,
    isIncludedInProfessional: true,
    isIncludedInEnterprise: true,
    features: ['Professional Layout', 'Basic Customization', 'Email Support'],
    previewColor: 'bg-gradient-to-br from-blue-500 to-cyan-500',
    popularity: 95,
    lastUpdated: '2024-01-15',
    templateStyle: 'standard'
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Simple and elegant, focuses on content',
    colors: {
      primary: [52, 73, 94],
      secondary: [127, 140, 141],
      accent: [236, 240, 241],
      text: [44, 62, 80]
    },
    fonts: {
      title: 'helvetica',
      body: 'helvetica',
      accent: 'helvetica'
    },
    layout: {
      showLogo: false,
      showWatermark: false,
      showHeaderBorder: false,
      showFooter: false,
      hasAnimations: false,
      hasGradientEffects: false,
      hasMultiLanguage: false
    },
    category: 'STANDARD',
    isPremium: false,
    isFree: true,
    isDefault: false,
    price: 5,
    isActive: true,
    previewImage: '',
    isIncludedInStarter: true,
    isIncludedInProfessional: true,
    isIncludedInEnterprise: true,
    features: ['Clean Design', 'Focus on Content', 'Fast Loading'],
    previewColor: 'bg-gradient-to-br from-gray-700 to-gray-900',
    popularity: 85,
    lastUpdated: '2024-01-10',
    templateStyle: 'minimal'
  },
  {
    id: 'luxury',
    name: 'Luxury',
    description: 'Elegant design for high-end businesses with gold accents and premium effects',
    colors: {
      primary: [184, 134, 11],
      secondary: [160, 124, 44],
      accent: [244, 244, 244],
      text: [33, 33, 33]
    },
    fonts: {
      title: 'times-bold',
      body: 'helvetica',
      accent: 'helvetica-oblique'
    },
    layout: {
      showLogo: true,
      showWatermark: true,
      watermarkText: 'PREMIUM',
      showHeaderBorder: true,
      showFooter: true,
      hasAnimations: true,
      hasGradientEffects: true,
      hasMultiLanguage: false,
      hasBackgroundPattern: true
    },
    category: 'ELITE',
    isPremium: true,
    isDefault: false,
    price: 25,
    isActive: true,
    previewImage: '',
    isIncludedInStarter: false,
    isIncludedInProfessional: false,
    isIncludedInEnterprise: true,
    features: [
      'Gold Accents & Effects',
      'Custom Watermark',
      'Premium Support',
      'Priority Updates',
      'Animated Elements',
      'Background Patterns'
    ],
    previewColor: 'bg-gradient-to-br from-amber-500 via-yellow-400 to-amber-600',
    popularity: 92,
    lastUpdated: '2024-02-01',
    tags: ['luxury', 'elegant', 'premium'],
    templateStyle: 'luxury'
  },
  {
    id: 'corporatePro',
    name: 'Corporate Pro',
    description: 'Advanced corporate template with multiple language support and professional features',
    colors: {
      primary: [13, 71, 161],
      secondary: [21, 101, 192],
      accent: [250, 250, 250],
      text: [38, 50, 56]
    },
    fonts: {
      title: 'helvetica-bold',
      body: 'helvetica',
      accent: 'helvetica-light'
    },
    layout: {
      showLogo: true,
      showWatermark: true,
      watermarkText: 'PROFESSIONAL',
      showHeaderBorder: true,
      showFooter: true,
      hasAnimations: true,
      hasGradientEffects: true,
      hasMultiLanguage: true,
      hasDataTables: true
    },
    category: 'ELITE',
    isPremium: true,
    isDefault: false,
    price: 25,
    isActive: true,
    previewImage: '',
    isIncludedInStarter: false,
    isIncludedInProfessional: false,
    isIncludedInEnterprise: true,
    features: [
      'Multi-language Support',
      'Advanced Tax Calculations',
      'Currency Converter',
      'Advanced Analytics',
      'Data Tables',
      'Professional Watermark'
    ],
    previewColor: 'bg-gradient-to-br from-blue-700 via-blue-600 to-blue-800',
    popularity: 88,
    lastUpdated: '2024-02-05',
    tags: ['corporate', 'professional', 'multi-language'],
    templateStyle: 'corporatePro'
  },
  {
    id: 'creativeStudio',
    name: 'Creative Studio',
    description: 'Modern design with animations, interactive elements and creative layouts',
    colors: {
      primary: [233, 30, 99],
      secondary: [216, 27, 96],
      accent: [255, 255, 255],
      text: [33, 33, 33]
    },
    fonts: {
      title: 'helvetica-bold',
      body: 'courier',
      accent: 'helvetica'
    },
    layout: {
      showLogo: true,
      showWatermark: true,
      watermarkText: 'CREATIVE',
      showHeaderBorder: false,
      showFooter: true,
      hasAnimations: true,
      hasGradientEffects: true,
      hasMultiLanguage: false,
      hasInteractiveElements: true
    },
    category: 'ELITE',
    isPremium: true,
    isDefault: false,
    price: 25,
    isActive: true,
    previewImage: '',
    isIncludedInStarter: false,
    isIncludedInProfessional: false,
    isIncludedInEnterprise: true,
    features: [
      'Animated Elements',
      'Interactive PDF',
      '3D Preview',
      'Color Customizer',
      'Creative Layouts',
      'Visual Effects'
    ],
    previewColor: 'bg-gradient-to-br from-pink-600 via-rose-500 to-pink-700',
    popularity: 95,
    lastUpdated: '2024-01-28',
    tags: ['creative', 'modern', 'animated'],
    templateStyle: 'creativeStudio'
  },
  {
    id: 'techModern',
    name: 'Tech Modern',
    description: 'Futuristic design for tech companies with gradient effects and dark mode',
    colors: {
      primary: [0, 188, 212],
      secondary: [0, 151, 167],
      accent: [245, 248, 250],
      text: [38, 50, 56]
    },
    fonts: {
      title: 'helvetica-bold',
      body: 'roboto',
      accent: 'helvetica-light'
    },
    layout: {
      showLogo: true,
      showWatermark: true,
      watermarkText: 'TECH',
      showHeaderBorder: true,
      showFooter: true,
      hasAnimations: true,
      hasGradientEffects: true,
      hasMultiLanguage: false,
      hasDarkMode: true
    },
    category: 'PREMIUM',
    isPremium: true,
    isDefault: false,
    price: 12,
    isActive: true,
    previewImage: '',
    isIncludedInStarter: false,
    isIncludedInProfessional: true,
    isIncludedInEnterprise: true,
    features: [
      'Gradient Effects',
      'Dark Mode',
      'Code Syntax Highlighting',
      'API Integration',
      'Tech Icons',
      'Modern Layout'
    ],
    previewColor: 'bg-gradient-to-br from-cyan-500 via-teal-500 to-green-500',
    popularity: 90,
    lastUpdated: '2024-02-03',
    tags: ['tech', 'modern', 'gradient'],
    templateStyle: 'techModern'
  },
  {
    id: 'elegant',
    name: 'Elegant',
    description: 'Sophisticated design with subtle animations and premium typography',
    colors: {
      primary: [121, 85, 72],
      secondary: [141, 110, 99],
      accent: [250, 250, 249],
      text: [66, 66, 66]
    },
    fonts: {
      title: 'garamond',
      body: 'georgia',
      accent: 'helvetica-light'
    },
    layout: {
      showLogo: true,
      showWatermark: true,
      watermarkText: 'ELEGANT',
      showHeaderBorder: true,
      showFooter: true,
      hasAnimations: true,
      hasGradientEffects: false,
      hasMultiLanguage: false,
      hasPremiumTypography: true
    },
    category: 'PREMIUM',
    isPremium: true,
    isDefault: false,
    price: 12,
    isActive: true,
    previewImage: '',
    isIncludedInStarter: false,
    isIncludedInProfessional: true,
    isIncludedInEnterprise: true,
    features: [
      'Premium Typography',
      'Subtle Animations',
      'Elegant Borders',
      'Custom Icons',
      'Refined Layout',
      'Print Optimized'
    ],
    previewColor: 'bg-gradient-to-br from-amber-800 via-amber-700 to-amber-900',
    popularity: 87,
    lastUpdated: '2024-01-25',
    tags: ['elegant', 'sophisticated', 'print'],
    templateStyle: 'elegant'
  },
  {
    id: 'startup',
    name: 'Startup',
    description: 'Vibrant design for startups with modern elements and growth-focused features',
    colors: {
      primary: [76, 175, 80],
      secondary: [56, 142, 60],
      accent: [232, 245, 233],
      text: [33, 33, 33]
    },
    fonts: {
      title: 'helvetica-bold',
      body: 'helvetica',
      accent: 'helvetica-light'
    },
    layout: {
      showLogo: true,
      showWatermark: true,
      watermarkText: 'STARTUP',
      showHeaderBorder: false,
      showFooter: true,
      hasAnimations: true,
      hasGradientEffects: true,
      hasMultiLanguage: false,
      hasGrowthMetrics: true
    },
    category: 'PREMIUM',
    isPremium: true,
    isDefault: false,
    price: 12,
    isActive: true,
    previewImage: '',
    isIncludedInStarter: false,
    isIncludedInProfessional: true,
    isIncludedInEnterprise: true,
    features: [
      'Growth Metrics',
      'Progress Indicators',
      'Milestone Tracking',
      'Team Collaboration',
      'Vibrant Colors',
      'Modern Elements'
    ],
    previewColor: 'bg-gradient-to-br from-emerald-500 via-green-500 to-emerald-600',
    popularity: 84,
    lastUpdated: '2024-02-02',
    tags: ['startup', 'modern', 'growth'],
    templateStyle: 'startup'
  },
  {
    id: 'consultant',
    name: 'Consultant',
    description: 'Polished, client-ready template for consultants and agencies',
    colors: {
      primary: [45, 108, 223],
      secondary: [63, 123, 236],
      accent: [236, 244, 255],
      text: [38, 50, 56]
    },
    fonts: {
      title: 'helvetica-bold',
      body: 'helvetica',
      accent: 'helvetica-light'
    },
    layout: {
      showLogo: true,
      showWatermark: true,
      watermarkText: 'CONSULTANT',
      showHeaderBorder: true,
      showFooter: true,
      hasAnimations: true,
      hasGradientEffects: true,
      hasMultiLanguage: false,
      hasDataTables: true
    },
    category: 'PREMIUM',
    isPremium: true,
    isDefault: false,
    price: 12,
    isActive: true,
    previewImage: '',
    isIncludedInStarter: false,
    isIncludedInProfessional: true,
    isIncludedInEnterprise: true,
    features: [
      'Client-ready Layout',
      'Professional Accent Colors',
      'Detailed Line Items',
      'Priority Support',
      'Custom Watermark'
    ],
    previewColor: 'bg-gradient-to-br from-blue-600 via-indigo-500 to-blue-700',
    popularity: 86,
    lastUpdated: '2024-02-06',
    tags: ['consulting', 'agency', 'professional'],
    templateStyle: 'consultant'
  },
  {
    id: 'retail',
    name: 'Retail',
    description: 'Bright retail template with item-forward layout for stores',
    colors: {
      primary: [244, 81, 30],
      secondary: [255, 152, 0],
      accent: [255, 248, 225],
      text: [55, 71, 79]
    },
    fonts: {
      title: 'helvetica-bold',
      body: 'helvetica',
      accent: 'helvetica-light'
    },
    layout: {
      showLogo: true,
      showWatermark: true,
      watermarkText: 'RETAIL',
      showHeaderBorder: true,
      showFooter: true,
      hasAnimations: true,
      hasGradientEffects: true,
      hasMultiLanguage: false
    },
    category: 'STANDARD',
    isPremium: false,
    isDefault: false,
    price: 5,
    isActive: true,
    previewImage: '',
    isIncludedInStarter: true,
    isIncludedInProfessional: true,
    isIncludedInEnterprise: true,
    features: [
      'Itemized Layout',
      'Retail-ready Styling',
      'Bold Highlights',
      'Priority Support'
    ],
    previewColor: 'bg-gradient-to-br from-orange-500 via-amber-500 to-orange-600',
    popularity: 83,
    lastUpdated: '2024-02-06',
    tags: ['retail', 'store', 'point-of-sale'],
    templateStyle: 'retail'
  },
  {
    id: 'medical',
    name: 'Medical',
    description: 'Professional template for healthcare and medical services',
    colors: {
      primary: [3, 155, 229],
      secondary: [2, 136, 209],
      accent: [232, 244, 253],
      text: [33, 33, 33]
    },
    fonts: {
      title: 'helvetica',
      body: 'helvetica',
      accent: 'helvetica-light'
    },
    layout: {
      showLogo: true,
      showWatermark: false,
      showHeaderBorder: true,
      showFooter: true,
      hasAnimations: false,
      hasGradientEffects: false,
      hasMultiLanguage: false
    },
    category: 'STANDARD',
    isPremium: false,
    isDefault: false,
    price: 5,
    isActive: true,
    previewImage: '',
    isIncludedInStarter: true,
    isIncludedInProfessional: true,
    isIncludedInEnterprise: true,
    features: ['Medical Icons', 'HIPAA Compliant', 'Patient Focused'],
    previewColor: 'bg-gradient-to-br from-blue-400 to-cyan-400',
    popularity: 78,
    lastUpdated: '2024-01-20',
    templateStyle: 'medical'
  },
  {
    id: 'legal',
    name: 'Legal',
    description: 'Formal template for law firms and legal services',
    colors: {
      primary: [56, 142, 60],
      secondary: [67, 160, 71],
      accent: [241, 248, 233],
      text: [33, 33, 33]
    },
    fonts: {
      title: 'times',
      body: 'times',
      accent: 'times-italic'
    },
    layout: {
      showLogo: true,
      showWatermark: false,
      showHeaderBorder: true,
      showFooter: true,
      hasAnimations: false,
      hasGradientEffects: false,
      hasMultiLanguage: false
    },
    category: 'STANDARD',
    isPremium: false,
    isDefault: false,
    price: 5,
    isActive: true,
    previewImage: '',
    isIncludedInStarter: true,
    isIncludedInProfessional: true,
    isIncludedInEnterprise: true,
    features: ['Formal Layout', 'Legal Terminology', 'Document Numbering'],
    previewColor: 'bg-gradient-to-br from-emerald-400 to-green-400',
    popularity: 75,
    lastUpdated: '2024-01-18',
    templateStyle: 'legal'
  }
];

module.exports = templates;
