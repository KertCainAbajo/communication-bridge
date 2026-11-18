<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\SyncRequest;
use App\Services\CommunicationSyncService;
use App\Support\ApiResponse;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;

class SyncController extends Controller
{
    public function __invoke(SyncRequest $request, CommunicationSyncService $sync): JsonResponse
    {
        $sinceValue = $request->validated('since');
        $since = $sinceValue === null ? null : CarbonImmutable::parse($sinceValue)->utc();
        $snapshot = $sync->snapshot($since, $request);

        return ApiResponse::success(
            'Communication content synchronized successfully.',
            $snapshot['data'],
            $snapshot['meta'],
        );
    }
}
