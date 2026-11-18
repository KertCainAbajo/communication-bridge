<?php

return [
    'api_rate_limit' => (int) env('COMMUNICATION_API_RATE_LIMIT', 600),
    'default_language' => env('COMMUNICATION_DEFAULT_LANGUAGE', 'en'),
];
