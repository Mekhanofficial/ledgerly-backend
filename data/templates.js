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
    id: 'professionalClassic',
    name: 'Professional Classic',
    description: 'Traditional invoice with Bill To and Ship To sections for service businesses',
    colors: {
      primary: [44, 62, 80],
      secondary: [52, 73, 94],
      accent: [245, 247, 250],
      text: [33, 37, 41],
      border: [206, 212, 218]
    },
    fonts: {
      title: 'helvetica-bold',
      body: 'helvetica',
      accent: 'helvetica-light'
    },
    layout: {
      showLogo: true,
      showWatermark: false,
      showHeaderBorder: true,
      showFooter: true,
      hasDualAddress: true,
      headerStyle: 'letterhead'
    },
    category: 'PREMIUM',
    isPremium: true,
    isDefault: false,
    price: 7.99,
    isActive: true,
    previewImage: '',
    isIncludedInStarter: false,
    isIncludedInProfessional: true,
    isIncludedInEnterprise: true,
    features: [
      'Bill To and Ship To columns',
      'PO number support',
      'Classic letterhead layout'
    ],
    previewColor: 'bg-gradient-to-br from-slate-700 to-slate-800',
    popularity: 92,
    lastUpdated: '2026-02-11',
    tags: ['classic', 'professional', 'service'],
    templateStyle: 'professionalClassic'
  },
  {
    id: 'modernCorporate',
    name: 'Modern Corporate',
    description: 'Bold corporate layout with strong brand header and modern invoice table',
    colors: {
      primary: [0, 70, 140],
      secondary: [0, 110, 200],
      accent: [240, 248, 255],
      text: [38, 50, 56],
      border: [200, 215, 230]
    },
    fonts: {
      title: 'helvetica-bold',
      body: 'helvetica',
      accent: 'helvetica-oblique'
    },
    layout: {
      showLogo: true,
      showWatermark: true,
      watermarkText: 'CORPORATE',
      showHeaderBorder: false,
      showFooter: true,
      headerStyle: 'brand-bar'
    },
    category: 'PREMIUM',
    isPremium: true,
    isDefault: false,
    price: 9.99,
    isActive: true,
    previewImage: '',
    isIncludedInStarter: false,
    isIncludedInProfessional: true,
    isIncludedInEnterprise: true,
    features: [
      'Branded header bar',
      'Modern table styling',
      'Corporate look and feel'
    ],
    previewColor: 'bg-gradient-to-br from-blue-800 to-blue-600',
    popularity: 90,
    lastUpdated: '2026-02-11',
    tags: ['corporate', 'agency', 'modern'],
    templateStyle: 'modernCorporate'
  },
  {
    id: 'cleanBilling',
    name: 'Clean Billing',
    description: 'Minimal and airy billing design focused on readability',
    colors: {
      primary: [100, 116, 139],
      secondary: [148, 163, 184],
      accent: [248, 250, 252],
      text: [30, 41, 59],
      border: [203, 213, 225]
    },
    fonts: {
      title: 'helvetica-light',
      body: 'helvetica',
      accent: 'helvetica-light'
    },
    layout: {
      showLogo: false,
      showWatermark: false,
      showHeaderBorder: true,
      showFooter: true,
      headerStyle: 'thin-line'
    },
    category: 'PREMIUM',
    isPremium: true,
    isDefault: false,
    price: 6.99,
    isActive: true,
    previewImage: '',
    isIncludedInStarter: false,
    isIncludedInProfessional: true,
    isIncludedInEnterprise: true,
    features: [
      'Minimalist structure',
      'Soft neutral palette',
      'Billing-first layout'
    ],
    previewColor: 'bg-gradient-to-br from-slate-400 to-slate-500',
    popularity: 85,
    lastUpdated: '2026-02-11',
    tags: ['clean', 'minimal', 'billing'],
    templateStyle: 'cleanBilling'
  },
  {
    id: 'retailReceipt',
    name: 'Retail Receipt',
    description: 'Retail-friendly invoice style with item-focused presentation',
    colors: {
      primary: [13, 148, 136],
      secondary: [20, 184, 166],
      accent: [240, 253, 250],
      text: [31, 41, 55],
      border: [153, 246, 228]
    },
    fonts: {
      title: 'helvetica-bold',
      body: 'helvetica',
      accent: 'helvetica'
    },
    layout: {
      showLogo: true,
      showWatermark: false,
      showHeaderBorder: false,
      showFooter: true,
      headerStyle: 'simple'
    },
    category: 'PREMIUM',
    isPremium: true,
    isDefault: false,
    price: 8.99,
    isActive: true,
    previewImage: '',
    isIncludedInStarter: false,
    isIncludedInProfessional: true,
    isIncludedInEnterprise: true,
    features: [
      'Item-focused line rows',
      'SKU-friendly format',
      'Store-ready styling'
    ],
    previewColor: 'bg-gradient-to-br from-teal-600 to-cyan-600',
    popularity: 88,
    lastUpdated: '2026-02-11',
    tags: ['retail', 'receipt', 'store'],
    templateStyle: 'retailReceipt'
  },
  {
    id: 'simpleElegant',
    name: 'Simple Elegant',
    description: 'Subtle formal style with centered headings and serif typography',
    colors: {
      primary: [55, 65, 81],
      secondary: [75, 85, 99],
      accent: [249, 250, 251],
      text: [17, 24, 39],
      border: [229, 231, 235]
    },
    fonts: {
      title: 'times-bold',
      body: 'times',
      accent: 'times'
    },
    layout: {
      showLogo: false,
      showWatermark: false,
      showHeaderBorder: true,
      showFooter: false,
      headerStyle: 'centered'
    },
    category: 'PREMIUM',
    isPremium: true,
    isDefault: false,
    price: 7.49,
    isActive: true,
    previewImage: '',
    isIncludedInStarter: false,
    isIncludedInProfessional: true,
    isIncludedInEnterprise: true,
    features: [
      'Centered heading',
      'Formal serif style',
      'Minimal visual noise'
    ],
    previewColor: 'bg-gradient-to-br from-gray-600 to-gray-700',
    popularity: 82,
    lastUpdated: '2026-02-11',
    tags: ['elegant', 'formal', 'serif'],
    templateStyle: 'simpleElegant'
  },
  {
    id: 'urbanEdge',
    name: 'Urban Edge',
    description: 'Contemporary asymmetric layout with strong accent blocks',
    colors: {
      primary: [202, 138, 4],
      secondary: [217, 119, 6],
      accent: [255, 251, 235],
      text: [28, 25, 23],
      border: [245, 158, 11]
    },
    fonts: {
      title: 'helvetica-bold',
      body: 'helvetica',
      accent: 'helvetica-bold'
    },
    layout: {
      showLogo: true,
      showWatermark: true,
      watermarkText: 'URBAN',
      showHeaderBorder: true,
      showFooter: true,
      hasSignature: true,
      headerStyle: 'asymmetric'
    },
    category: 'PREMIUM',
    isPremium: true,
    isDefault: false,
    price: 10.99,
    isActive: true,
    previewImage: '',
    isIncludedInStarter: false,
    isIncludedInProfessional: true,
    isIncludedInEnterprise: true,
    features: [
      'Asymmetric accents',
      'Signature-ready footer',
      'Bold urban palette'
    ],
    previewColor: 'bg-gradient-to-br from-amber-600 to-orange-600',
    popularity: 95,
    lastUpdated: '2026-02-11',
    tags: ['urban', 'bold', 'asymmetric'],
    templateStyle: 'urbanEdge'
  },
  {
    id: 'creativeFlow',
    name: 'Creative Flow',
    description: 'Art-inspired layout with fluid separators and decorative sections',
    colors: {
      primary: [147, 51, 234],
      secondary: [168, 85, 247],
      accent: [250, 245, 255],
      text: [31, 41, 55],
      border: [216, 180, 254]
    },
    fonts: {
      title: 'helvetica-bold',
      body: 'helvetica',
      accent: 'helvetica-light'
    },
    layout: {
      showLogo: true,
      showWatermark: true,
      watermarkText: 'CREATIVE',
      showHeaderBorder: false,
      showFooter: true,
      hasWave: true,
      headerStyle: 'flow'
    },
    category: 'PREMIUM',
    isPremium: true,
    isDefault: false,
    price: 11.99,
    isActive: true,
    previewImage: '',
    isIncludedInStarter: false,
    isIncludedInProfessional: true,
    isIncludedInEnterprise: true,
    features: [
      'Fluid separators',
      'Creative color blend',
      'Decorative footer treatment'
    ],
    previewColor: 'bg-gradient-to-br from-purple-600 to-fuchsia-600',
    popularity: 94,
    lastUpdated: '2026-02-11',
    tags: ['creative', 'flow', 'artistic'],
    templateStyle: 'creativeFlow'
  },
  {
    id: 'glassmorphic',
    name: 'Glassmorphic',
    description: 'Translucent layered style with subtle neon accents',
    colors: {
      primary: [88, 101, 242],
      secondary: [121, 134, 255],
      accent: [255, 255, 255],
      text: [15, 23, 42],
      border: [203, 213, 225]
    },
    fonts: {
      title: 'helvetica-bold',
      body: 'helvetica',
      accent: 'helvetica-light'
    },
    layout: {
      showLogo: true,
      showWatermark: true,
      watermarkText: 'GLASS',
      showHeaderBorder: false,
      showFooter: true,
      hasBackdropBlur: true,
      hasNeonGlow: true,
      headerStyle: 'floating'
    },
    category: 'ELITE',
    isPremium: true,
    isDefault: false,
    price: 19.99,
    isActive: true,
    previewImage: '',
    isIncludedInStarter: false,
    isIncludedInProfessional: false,
    isIncludedInEnterprise: true,
    features: [
      'Glass-like surface feel',
      'Neon accent treatment',
      'Floating content cards'
    ],
    previewColor: 'bg-gradient-to-br from-indigo-400 via-purple-400 to-pink-400',
    popularity: 97,
    lastUpdated: '2026-02-12',
    tags: ['glass', 'neon', 'modern'],
    templateStyle: 'glassmorphic'
  },
  {
    id: 'neoBrutalist',
    name: 'Neo-Brutalist',
    description: 'High-contrast brutalist style with oversized typography',
    colors: {
      primary: [255, 89, 94],
      secondary: [54, 79, 107],
      accent: [252, 196, 54],
      text: [10, 10, 10],
      border: [0, 0, 0]
    },
    fonts: {
      title: 'helvetica-bold',
      body: 'courier',
      accent: 'helvetica-bold'
    },
    layout: {
      showLogo: true,
      showWatermark: false,
      showHeaderBorder: false,
      showFooter: true,
      hasAsymmetricGrid: true,
      hasOversizedText: true,
      headerStyle: 'brutal'
    },
    category: 'ELITE',
    isPremium: true,
    isDefault: false,
    price: 16.99,
    isActive: true,
    previewImage: '',
    isIncludedInStarter: false,
    isIncludedInProfessional: false,
    isIncludedInEnterprise: true,
    features: [
      'Oversized headings',
      'Raw brutalist blocks',
      'Asymmetric structure'
    ],
    previewColor: 'bg-gradient-to-br from-red-600 to-amber-500',
    popularity: 91,
    lastUpdated: '2026-02-12',
    tags: ['brutalist', 'bold', 'asymmetric'],
    templateStyle: 'neoBrutalist'
  },
  {
    id: 'holographic',
    name: 'Holographic',
    description: 'Iridescent gradient design with premium futuristic styling',
    colors: {
      primary: [168, 85, 247],
      secondary: [236, 72, 153],
      accent: [251, 146, 60],
      text: [255, 255, 255],
      border: [255, 255, 255]
    },
    fonts: {
      title: 'helvetica-bold',
      body: 'helvetica',
      accent: 'helvetica-light'
    },
    layout: {
      showLogo: true,
      showWatermark: true,
      watermarkText: 'HOLO',
      showHeaderBorder: false,
      showFooter: true,
      hasIridescentGradient: true,
      hasMetallicEdge: true,
      headerStyle: 'prism'
    },
    category: 'ELITE',
    isPremium: true,
    isDefault: false,
    price: 18.99,
    isActive: true,
    previewImage: '',
    isIncludedInStarter: false,
    isIncludedInProfessional: false,
    isIncludedInEnterprise: true,
    features: [
      'Iridescent gradients',
      'Premium metallic accenting',
      'Luxury visual style'
    ],
    previewColor: 'bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500',
    popularity: 99,
    lastUpdated: '2026-02-12',
    tags: ['holographic', 'iridescent', 'luxury'],
    templateStyle: 'holographic'
  },
  {
    id: 'minimalistDark',
    name: 'Minimalist Dark',
    description: 'Dark-mode minimalist invoice with subtle glow accents',
    colors: {
      primary: [0, 122, 255],
      secondary: [88, 86, 214],
      accent: [44, 44, 46],
      text: [255, 255, 255],
      border: [72, 72, 74]
    },
    fonts: {
      title: 'courier',
      body: 'courier',
      accent: 'helvetica-light'
    },
    layout: {
      showLogo: true,
      showWatermark: true,
      watermarkText: 'DARK',
      showHeaderBorder: true,
      showFooter: true,
      hasDarkMode: true,
      hasGlowEffect: true,
      headerStyle: 'terminal'
    },
    category: 'ELITE',
    isPremium: true,
    isDefault: false,
    price: 14.99,
    isActive: true,
    previewImage: '',
    isIncludedInStarter: false,
    isIncludedInProfessional: false,
    isIncludedInEnterprise: true,
    features: [
      'Dark mode design',
      'Monospace-first styling',
      'Subtle glow accents'
    ],
    previewColor: 'bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900',
    popularity: 94,
    lastUpdated: '2026-02-12',
    tags: ['dark', 'minimal', 'tech'],
    templateStyle: 'minimalistDark'
  },
  {
    id: 'organicEco',
    name: 'Organic Eco',
    description: 'Nature-inspired invoice style with soft curves and calm tones',
    colors: {
      primary: [34, 197, 94],
      secondary: [74, 222, 128],
      accent: [254, 249, 195],
      text: [20, 83, 45],
      border: [187, 247, 208]
    },
    fonts: {
      title: 'georgia',
      body: 'georgia',
      accent: 'helvetica-light'
    },
    layout: {
      showLogo: true,
      showWatermark: true,
      watermarkText: 'ECO',
      showHeaderBorder: false,
      showFooter: true,
      hasWaveBorder: true,
      hasBotanicalIcon: true,
      headerStyle: 'rounded'
    },
    category: 'ELITE',
    isPremium: true,
    isDefault: false,
    price: 15.99,
    isActive: true,
    previewImage: '',
    isIncludedInStarter: false,
    isIncludedInProfessional: false,
    isIncludedInEnterprise: true,
    features: [
      'Natural palette',
      'Organic curved sections',
      'Eco-forward visual language'
    ],
    previewColor: 'bg-gradient-to-br from-green-400 to-emerald-600',
    popularity: 89,
    lastUpdated: '2026-02-12',
    tags: ['eco', 'organic', 'natural'],
    templateStyle: 'organicEco'
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
