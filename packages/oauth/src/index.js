import express from "express";
import session from "express-session";
import grant from "grant";

const PORT = process.env.PORT || 9001;
const app = express();

app.use(
  session({
    secret: "grant", // signing secret
    resave: false, // only save session if modified
    saveUninitialized: false, // don’t create empty sessions
    cookie: {
      secure: false, // set true if serving over HTTPS
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    },
  })
);

app.use(
  grant.express()({
    defaults: {
      origin: `http://localhost:${PORT}`,
      dynamic: true,
    },
  })
);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Oauth Proxy listening on port ${PORT}`);
});
