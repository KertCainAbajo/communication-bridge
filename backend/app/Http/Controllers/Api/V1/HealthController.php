<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Throwable;

class HealthController extends Controller
{
    public function __invoke(): JsonResponse
    {
        try {
            DB::connection()->getPdo();
        } catch (Throwable) {
            return ApiResponse::failure(
                'The application is running, but its database is unavailable.',
                ['database' => ['Database connection failed.']],
                503,
            );
        }

        return ApiResponse::success(
            'Application health retrieved successfully.',
            [
                'status' => 'ok',
                'database' => ['status' => 'connected'],
                'checked_at' => now()->toISOString(),
            ],
        );
    }
}
