<script lang="ts" setup>
defineOptions({ name: 'WaveBg' });
</script>

<template>
  <div class="absolute-lt z-1 size-full overflow-hidden">
    <!-- 银河星云光晕 -->
    <div class="absolute -right-300px -top-900px opacity-80 blur-120px lt-sm:(-right-100px -top-1170px)">
      <svg height="1337" width="1337" viewBox="0 0 1337 1337">
        <defs>
          <radialGradient id="galaxy-1" cx="0.3" cy="0.3" r="0.9">
            <stop offset="0%" stop-color="#7c3aed" />
            <stop offset="45%" stop-color="#2563eb" />
            <stop offset="100%" stop-color="#020617" stop-opacity="0" />
          </radialGradient>
        </defs>
        <circle cx="668.5" cy="668.5" r="668.5" fill="url(#galaxy-1)" />
      </svg>
    </div>

    <div class="absolute -bottom-400px -left-200px opacity-70 blur-100px lt-sm:(-bottom-760px -left-100px)">
      <svg height="896" width="968" viewBox="0 0 968 896">
        <defs>
          <radialGradient id="galaxy-2" cx="0.7" cy="0.3" r="0.9">
            <stop offset="0%" stop-color="#db2777" />
            <stop offset="50%" stop-color="#4f46e5" />
            <stop offset="100%" stop-color="#020617" stop-opacity="0" />
          </radialGradient>
        </defs>
        <circle cx="484" cy="448" r="448" fill="url(#galaxy-2)" />
      </svg>
    </div>

    <!-- 星星层 -->
    <div class="absolute inset-0 stars pointer-events-none"></div>
  </div>
</template>

<style scoped>
.stars {
  background-image:
    radial-gradient(2px 2px at 20px 30px, #fff, transparent),
    radial-gradient(2px 2px at 40px 70px, rgba(255, 255, 255, 0.8), transparent),
    radial-gradient(1px 1px at 50px 90px, #fff, transparent),
    radial-gradient(1px 1px at 130px 80px, rgba(255, 255, 255, 0.7), transparent),
    radial-gradient(2px 2px at 200px 150px, #fff, transparent),
    radial-gradient(1px 1px at 300px 250px, rgba(255, 255, 255, 0.8), transparent),
    radial-gradient(2px 2px at 450px 100px, #fff, transparent);
  background-size: 400px 300px;
}
</style>
