<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    class="bacs-logo"
  >
    <rect width="32" height="32" rx="6" class="logo-bg" />
    <text
      x="16"
      y="13.5"
      text-anchor="middle"
      font-family="-apple-system,BlinkMacSystemFont,Helvetica Neue,Arial,sans-serif"
      font-weight="800"
      font-size="9"
      letter-spacing="2.5"
      class="logo-text"
    >BA</text>
    <text
      x="16"
      y="25"
      text-anchor="middle"
      font-family="-apple-system,BlinkMacSystemFont,Helvetica Neue,Arial,sans-serif"
      font-weight="800"
      font-size="9"
      letter-spacing="2.5"
      class="logo-text"
    >CS</text>
  </svg>
</template>

<script setup lang="ts">
defineProps<{ size?: number }>();
</script>

<style scoped>
.bacs-logo { display: block; }
.logo-bg { fill: #1d1d1f; transition: fill 0.3s ease; }
.logo-text { fill: #f5f5f7; transition: fill 0.3s ease; }
.dark .logo-bg { fill: #f5f5f7; }
.dark .logo-text { fill: #1d1d1f; }
</style>
