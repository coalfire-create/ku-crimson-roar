import { defineConfig } from 'vite'

// three and gsap rarely change; give them their own chunks so a content
// update doesn't make returning visitors download them again.
export default defineConfig({
  build: {
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\\/]three[\\/]/ },
            { name: 'motion', test: /node_modules[\\/](gsap|lenis)[\\/]/ },
          ],
        },
      },
    },
  },
})
