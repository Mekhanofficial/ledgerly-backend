from pathlib import Path
import json

collection = {
    'info': {
        'name': 'Ledgerly API',
        'schema': 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        'version': '1.0'
    },
    'item': [
        {
            'name': 'Business',
            'item': [
                {
                    'name': 'Get Business Profile',
                    'request': {
                        'method': 'GET',
                        'header': [
                            {'key': 'Authorization', 'value': '{{auth_token}}', 'type': 'text'}
                        ],
                        'url': {
                            'raw': '{{base_url}}/business',
                            'host': ['{{base_url}}'],
                            'path': ['business']
                        }
                    }
                },
                {
                    'name': 'Update Invoice Settings',
                    'request': {
                        'method': 'PUT',
                        'header': [
                            {'key': 'Authorization', 'value': '{{auth_token}}', 'type': 'text'},
                            {'key': 'Content-Type', 'value': 'application/json', 'type': 'text'}
                        ],
                        'body': {
                            'mode': 'raw',
                            'raw': '{\"invoice\": {\"terms\": \"Net 21\", \"dueDays\": 21}}'
                        },
                        'url': {
                            'raw': '{{base_url}}/business/invoice-settings',
                            'host': ['{{base_url}}'],
                            'path': ['business', 'invoice-settings']
                        }
                    }
                },
                {
                    'name': 'Add Payment Method',
                    'request': {
                        'method': 'POST',
                        'header': [
                            {'key': 'Authorization', 'value': '{{auth_token}}', 'type': 'text'},
                            {'key': 'Content-Type', 'value': 'application/json', 'type': 'text'}
                        ],
                        'body': {
                            'mode': 'raw',
                            'raw': '{\"name\": \"Stripe\", \"accountDetails\": \"Account ID: acct_123\"}'
                        },
                        'url': {
                            'raw': '{{base_url}}/business/payment-methods',
                            'host': ['{{base_url}}'],
                            'path': ['business', 'payment-methods']
                        }
                    }
                }
            ]
        },
        {
            'name': 'Team',
            'item': [
                {
                    'name': 'List Team Members',
                    'request': {
                        'method': 'GET',
                        'header': [
                            {'key': 'Authorization', 'value': '{{auth_token}}', 'type': 'text'}
                        ],
                        'url': {
                            'raw': '{{base_url}}/team',
                            'host': ['{{base_url}}'],
                            'path': ['team']
                        }
                    }
                },
                {
                    'name': 'Invite Team Member',
                    'request': {
                        'method': 'POST',
                        'header': [
                            {'key': 'Authorization', 'value': '{{auth_token}}', 'type': 'text'},
                            {'key': 'Content-Type', 'value': 'application/json', 'type': 'text'}
                        ],
                        'body': {
                            'mode': 'raw',
                            'raw': '{\"name\": \"Alex Lee\", \"email\": \"alex@ledgerly.com\", \"role\": \"sales\"}'
                        },
                        'url': {
                            'raw': '{{base_url}}/team/invite',
                            'host': ['{{base_url}}'],
                            'path': ['team', 'invite']
                        }
                    }
                }
            ]
        },
        {
            'name': 'Payments',
            'item': [
                {
                    'name': 'List Payments',
                    'request': {
                        'method': 'GET',
                        'header': [
                            {'key': 'Authorization', 'value': '{{auth_token}}', 'type': 'text'}
                        ],
                        'url': {
                            'raw': '{{base_url}}/payments',
                            'host': ['{{base_url}}'],
                            'path': ['payments']
                        }
                    }
                },
                {
                    'name': 'Record Payment',
                    'request': {
                        'method': 'POST',
                        'header': [
                            {'key': 'Authorization', 'value': '{{auth_token}}', 'type': 'text'},
                            {'key': 'Content-Type', 'value': 'application/json', 'type': 'text'}
                        ],
                        'body': {
                            'mode': 'raw',
                            'raw': '{\"invoiceId\": \"{{invoice_id}}\", \"amount\": 100.00, \"paymentMethod\": \"card\"}'
                        },
                        'url': {
                            'raw': '{{base_url}}/payments',
                            'host': ['{{base_url}}'],
                            'path': ['payments']
                        }
                    }
                }
            ]
        },
        {
            'name': 'Settings',
            'item': [
                {
                    'name': 'Get Settings',
                    'request': {
                        'method': 'GET',
                        'header': [
                            {'key': 'Authorization', 'value': '{{auth_token}}', 'type': 'text'}
                        ],
                        'url': {
                            'raw': '{{base_url}}/settings',
                            'host': ['{{base_url}}'],
                            'path': ['settings']
                        }
                    }
                },
                {
                    'name': 'Update Notifications',
                    'request': {
                        'method': 'PUT',
                        'header': [
                            {'key': 'Authorization', 'value': '{{auth_token}}', 'type': 'text'},
                            {'key': 'Content-Type', 'value': 'application/json', 'type': 'text'}
                        ],
                        'body': {
                            'mode': 'raw',
                            'raw': '{\"notifications\": {\"lowStock\": {\"threshold\": 5}}}'
                        },
                        'url': {
                            'raw': '{{base_url}}/settings',
                            'host': ['{{base_url}}'],
                            'path': ['settings']
                        }
                    }
                },
                {
                    'name': 'Trigger Backup',
                    'request': {
                        'method': 'POST',
                        'header': [
                            {'key': 'Authorization', 'value': '{{auth_token}}', 'type': 'text'},
                            {'key': 'Content-Type', 'value': 'application/json', 'type': 'text'}
                        ],
                        'body': {
                            'mode': 'raw',
                            'raw': '{\"backupLocation\": \"s3://ledgerly-backups/business-{{business_id}}\"}'
                        },
                        'url': {
                            'raw': '{{base_url}}/settings/backup/run',
                            'host': ['{{base_url}}'],
                            'path': ['settings', 'backup', 'run']
                        }
                    }
                }
            ]
        }
    ],
    'variable': [
        {'key': 'base_url', 'value': 'http://localhost:7000/api/v1'},
        {'key': 'auth_token', 'value': 'Bearer <token>'}
    ]
}

Path('postman').mkdir(exist_ok=True)
Path('postman/ledgerly-api.postman_collection.json').write_text(json.dumps(collection, indent=2))
