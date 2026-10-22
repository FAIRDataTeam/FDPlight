<script setup lang="ts">
import icon from './assets/fdplight-icon.svg';
</script>

<template>
  <header class="header">
    <img :src="icon" alt="" class="logo" width="40" height="40" />
    <div>
      <h1 class="name">FDPlight</h1>
      <p class="tagline">a serverless FAIR Data Point</p>
    </div>
  </header>
  <main class="main">
    <section class="card">
      <h2>Work in progress</h2>
      <p>
        FDPlight will let data stewards publish a file-only FAIR Data Point: fill in forms
        generated from SHACL metadata schemas, get correctly wired Turtle files, commit them to
        GitHub Pages and have the FDP Index harvest them.
      </p>
      <p>
        <a href="https://github.com/FAIRDataTeam/FDPlight">github.com/FAIRDataTeam/FDPlight</a>
      </p>
    </section>
  </main>
</template>

<style scoped>
.header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 24px;
  background: var(--color-surface-card);
  border-bottom: 1px solid var(--color-border);
}
.logo {
  display: block;
}
.name {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 600;
  color: var(--color-primary);
}
.tagline {
  margin: 0;
  font-size: 0.9rem;
  color: var(--color-text-lighter);
}
.main {
  max-width: 720px;
  margin: 32px auto;
  padding: 0 16px;
}
.card {
  background: var(--color-surface-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-2);
  padding: 8px 24px 16px;
}
.card h2 {
  color: var(--color-primary);
  font-size: 1.1rem;
}
a {
  color: var(--color-accent);
}
</style>
