# 🔥 Karya App - Task Management System

## ⚠️ CRITICAL: Firestore Timestamp Format

**ALL DATES AND TIMES IN THIS APPLICATION USE FIRESTORE TIMESTAMP FORMAT**

- **Format**: `{ seconds: number, nanoseconds: number }`
- **Documentation**: See `FIRESTORE_TIMESTAMP_GUIDE.md` for complete details
- **Examples**: All task creation dates, completion dates, activity logs use this format
- **Parsing**: Use proper parsing methods, NOT `new Date(timestamp)`

## 📚 Quick Reference

```javascript
// ❌ WRONG - Don't do this
const date = new Date(task.createdAt);

// ✅ CORRECT - Do this instead
let date;
if (task.createdAt?.seconds) {
  date = new Date(task.createdAt.seconds * 1000 + (task.createdAt.nanoseconds || 0) / 1000000);
} else if (task.createdAt?.toDate) {
  date = task.createdAt.toDate();
} else {
  date = new Date(task.createdAt);
}
```

---

# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
