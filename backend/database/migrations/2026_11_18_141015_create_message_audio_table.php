<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('message_audio', function (Blueprint $table) {
            $table->id();
            $table->foreignId('message_id')->constrained()->cascadeOnDelete();
            $table->foreignId('language_id')->constrained()->cascadeOnDelete();
            $table->string('audio_path');
            $table->string('audio_format', 20)->nullable();
            $table->unsignedInteger('duration')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['message_id', 'language_id']);
            $table->index(['language_id', 'is_active']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('message_audio');
    }
};
