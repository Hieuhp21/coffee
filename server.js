const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
const cookieParser = require("cookie-parser");
const multer = require("multer");

const app = express();
const db = new sqlite3.Database("./database.sqlite");
const SECRET_KEY = "your-secret-key";

// Cấu hình multer để lưu tệp vào thư mục uploads/
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});
const upload = multer({ storage: storage });

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "public"));

// Tạo bảng
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT,
        info TEXT
    )`);

  db.run(`CREATE TABLE IF NOT EXISTS lots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        qrCode TEXT UNIQUE,
        status TEXT,
        farmerData TEXT,
        processorData TEXT,
        packerData TEXT,
        transporterData TEXT,
        retailerData TEXT
    )`);

  db.run(`CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        qrCode TEXT,
        role TEXT,
        action TEXT,
        data TEXT,
        timestamp TEXT
    )`);

  const users = [
    {
      username: "farmer1",
      password: "123",
      role: "farmer",
      info: JSON.stringify({
        name: "Nguyễn Văn A",
        address: "Đắk Lắk",
        area: "2.5 ha",
      }),
    },
    {
      username: "processor1",
      password: "123",
      role: "processor",
      info: JSON.stringify({
        name: "Nhà máy ABC",
        address: "KCN XYZ",
        capacity: "1000 kg/ngày",
      }),
    },
    {
      username: "packer1",
      password: "123",
      role: "packer",
      info: JSON.stringify({ name: "Xưởng XYZ", address: "KCN ABC" }),
    },
    {
      username: "transporter1",
      password: "123",
      role: "transporter",
      info: JSON.stringify({
        name: "Công ty ABC",
        address: "TP. Buôn Ma Thuột",
      }),
    },
    {
      username: "retailer1",
      password: "123",
      role: "retailer",
      info: JSON.stringify({ name: "Cửa hàng XYZ", address: "TP.HCM" }),
    },
    { username: "admin", password: "admin123", role: "admin", info: "{}" },
  ];

  users.forEach((user) => {
    bcrypt.hash(user.password, 10, (err, hash) => {
      if (!err) {
        db.run(
          `INSERT OR IGNORE INTO users (username, password, role, info) VALUES (?, ?, ?, ?)`,
          [user.username, hash, user.role, user.info]
        );
      }
    });
  });
});

// Đăng nhập
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  console.log("Đăng nhập:", username, password);
  db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
    if (err) {
      console.error("Lỗi database:", err);
      return res.status(500).json({ message: "Lỗi server" });
    }
    if (!user) {
      console.log("Không tìm thấy user:", username);
      return res.status(401).json({ message: "Tài khoản không tồn tại" });
    }
    bcrypt.compare(password, user.password, (err, result) => {
      if (err) {
        console.error("Lỗi bcrypt:", err);
        return res.status(500).json({ message: "Lỗi server" });
      }
      if (result) {
        const token = jwt.sign({ id: user.id, role: user.role }, SECRET_KEY, {
          expiresIn: "1h",
        });
        console.log("Token tạo:", token);
        res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });
        res.json({ role: user.role, redirect: "/dashboard" });
      } else {
        console.log("Sai mật khẩu cho:", username);
        res.status(401).json({ message: "Mật khẩu sai" });
      }
    });
  });
});

// Middleware kiểm tra token từ cookie
function authenticateToken(req, res, next) {
  const token = req.cookies.token;
  console.log("Token nhận được từ cookie:", token);
  if (!token) {
    console.log("Không có token, chuyển hướng về login");
    return res.redirect("/login.html");
  }
  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) {
      console.log("Token không hợp lệ:", err.message);
      return res.redirect("/login.html");
    }
    console.log("Token hợp lệ, user:", user);
    req.user = user;
    next();
  });
}

// Routes
app.get("/dashboard", authenticateToken, (req, res) => {
  db.get(`SELECT info FROM users WHERE id = ?`, [req.user.id], (err, row) => {
    if (err) {
      console.error("Lỗi lấy info user:", err);
      return res.status(500).send("Lỗi server");
    }
    if (!row) {
      console.log("Không tìm thấy user với id:", req.user.id);
      return res.redirect("/login.html");
    }
    const info = JSON.parse(row.info);
    console.log("Render dashboard cho:", info.name || `User_${req.user.id}`);
    res.render("dashboard", {
      role: req.user.role,
      username: info.name || `User_${req.user.id}`,
    });
  });
});

// Nông dân
app.get("/farmer/info", authenticateToken, (req, res) => {
  if (req.user.role !== "farmer") return res.status(403).send("Không có quyền");
  db.get(`SELECT info FROM users WHERE id = ?`, [req.user.id], (err, row) => {
    res.render("farmer/info", { info: JSON.parse(row.info) });
  });
});
app.get("/farmer/care", authenticateToken, (req, res) => {
  if (req.user.role !== "farmer") return res.status(403).send("Không có quyền");
  res.render("farmer/care", { username: `User_${req.user.id}` });
});
app.get("/farmer/harvest", authenticateToken, (req, res) => {
  if (req.user.role !== "farmer") return res.status(403).send("Không có quyền");
  res.render("farmer/harvest", { username: `User_${req.user.id}` });
});
app.get("/farmer/export", authenticateToken, (req, res) => {
  if (req.user.role !== "farmer") return res.status(403).send("Không có quyền");
  res.render("farmer/export", { username: `User_${req.user.id}` });
});
app.get("/farmer/history", authenticateToken, (req, res) => {
  if (req.user.role !== "farmer") return res.status(403).send("Không có quyền");
  db.all(`SELECT * FROM history WHERE role = 'farmer'`, (err, rows) => {
    res.render("farmer/history", {
      username: `User_${req.user.id}`,
      history: rows,
    });
  });
});

// Chế biến
app.get("/processor/info", authenticateToken, (req, res) => {
  if (req.user.role !== "processor")
    return res.status(403).send("Không có quyền");
  db.get(`SELECT info FROM users WHERE id = ?`, [req.user.id], (err, row) => {
    res.render("processor/info", { info: JSON.parse(row.info) });
  });
});
app.get("/processor/quality", authenticateToken, (req, res) => {
  if (req.user.role !== "processor")
    return res.status(403).send("Không có quyền");
  res.render("processor/quality", { username: `User_${req.user.id}` });
});
app.get("/processor/process", authenticateToken, (req, res) => {
  if (req.user.role !== "processor")
    return res.status(403).send("Không có quyền");
  res.render("processor/process", { username: `User_${req.user.id}` });
});
app.get("/processor/storage", authenticateToken, (req, res) => {
  if (req.user.role !== "processor")
    return res.status(403).send("Không có quyền");
  res.render("processor/storage", { username: `User_${req.user.id}` });
});
app.get("/processor/history", authenticateToken, (req, res) => {
  if (req.user.role !== "processor")
    return res.status(403).send("Không có quyền");
  db.all(`SELECT * FROM history WHERE role = 'processor'`, (err, rows) => {
    res.render("processor/history", {
      username: `User_${req.user.id}`,
      history: rows,
    });
  });
});

// Đóng gói
app.get("/packer/info", authenticateToken, (req, res) => {
  if (req.user.role !== "packer") return res.status(403).send("Không có quyền");
  db.get(`SELECT info FROM users WHERE id = ?`, [req.user.id], (err, row) => {
    res.render("packer/info", { info: JSON.parse(row.info) });
  });
});
app.get("/packer/pack", authenticateToken, (req, res) => {
  if (req.user.role !== "packer") return res.status(403).send("Không có quyền");
  res.render("packer/pack", { username: `User_${req.user.id}` });
});
app.get("/packer/storage", authenticateToken, (req, res) => {
  if (req.user.role !== "packer") return res.status(403).send("Không có quyền");
  res.render("packer/storage", { username: `User_${req.user.id}` });
});
app.get("/packer/history", authenticateToken, (req, res) => {
  if (req.user.role !== "packer") return res.status(403).send("Không có quyền");
  db.all(`SELECT * FROM history WHERE role = 'packer'`, (err, rows) => {
    res.render("packer/history", {
      username: `User_${req.user.id}`,
      history: rows,
    });
  });
});

// Vận chuyển
app.get("/transporter/info", authenticateToken, (req, res) => {
  if (req.user.role !== "transporter")
    return res.status(403).send("Không có quyền");
  db.get(`SELECT info FROM users WHERE id = ?`, [req.user.id], (err, row) => {
    res.render("transporter/info", { info: JSON.parse(row.info) });
  });
});
app.get("/transporter/transport", authenticateToken, (req, res) => {
  if (req.user.role !== "transporter")
    return res.status(403).send("Không có quyền");
  res.render("transporter/transport", { username: `User_${req.user.id}` });
});
app.get("/transporter/history", authenticateToken, (req, res) => {
  if (req.user.role !== "transporter")
    return res.status(403).send("Không có quyền");
  db.all(`SELECT * FROM history WHERE role = 'transporter'`, (err, rows) => {
    res.render("transporter/history", {
      username: `User_${req.user.id}`,
      history: rows,
    });
  });
});

// Bán lẻ
app.get("/retailer/info", authenticateToken, (req, res) => {
  if (req.user.role !== "retailer")
    return res.status(403).send("Không có quyền");
  db.get(`SELECT info FROM users WHERE id = ?`, [req.user.id], (err, row) => {
    res.render("retailer/info", { info: JSON.parse(row.info) });
  });
});
app.get("/retailer/receive", authenticateToken, (req, res) => {
  if (req.user.role !== "retailer")
    return res.status(403).send("Không có quyền");
  res.render("retailer/receive", { username: `User_${req.user.id}` });
});
app.get("/retailer/sell", authenticateToken, (req, res) => {
  if (req.user.role !== "retailer")
    return res.status(403).send("Không có quyền");
  res.render("retailer/sell", { username: `User_${req.user.id}` });
});
app.get("/retailer/history", authenticateToken, (req, res) => {
  if (req.user.role !== "retailer")
    return res.status(403).send("Không có quyền");
  db.all(`SELECT * FROM history WHERE role = 'retailer'`, (err, rows) => {
    res.render("retailer/history", {
      username: `User_${req.user.id}`,
      history: rows,
    });
  });
});

// Admin
app.get("/admin/users", authenticateToken, (req, res) => {
  if (req.user.role !== "admin") return res.status(403).send("Không có quyền");
  db.all(`SELECT * FROM users`, (err, rows) => {
    res.render("admin/users", {
      username: `Admin_${req.user.id}`,
      users: rows,
    });
  });
});
app.get("/admin/lots", authenticateToken, (req, res) => {
  if (req.user.role !== "admin") return res.status(403).send("Không có quyền");
  db.all(`SELECT * FROM lots`, (err, rows) => {
    res.render("admin/lots", { username: `Admin_${req.user.id}`, lots: rows });
  });
});
app.get("/admin/history", authenticateToken, (req, res) => {
  if (req.user.role !== "admin") return res.status(403).send("Không có quyền");
  db.all(`SELECT * FROM history`, (err, rows) => {
    res.render("admin/history", {
      username: `Admin_${req.user.id}`,
      history: rows,
    });
  });
});

// Lưu thông tin
app.post("/save-info", authenticateToken, (req, res) => {
  const info = req.body;
  db.run(
    `UPDATE users SET info = ? WHERE id = ?`,
    [JSON.stringify(info), req.user.id],
    (err) => {
      if (err) return res.status(500).json({ message: "Lỗi lưu thông tin" });
      res.json({ message: "Thông tin đã lưu" });
    }
  );
});

// Lưu dữ liệu lô và nhiều media từ form
app.post(
  "/save-form-with-media",
  authenticateToken,
  upload.array("media", 10),
  (req, res) => {
    const { qrCode, action, ...formData } = req.body;
    const role = req.user.role;
    const column = `${role}Data`;
    const timestamp = new Date().toISOString();
    const mediaFiles = req.files; // Lấy danh sách các tệp

    if (mediaFiles && mediaFiles.length > 0) {
      formData.media = mediaFiles.map((file) => ({
        filename: file.filename,
        originalName: file.originalname,
        type: file.mimetype,
        url: `/public/uploads/${file.filename}`,
      }));
    }

    db.get(`SELECT * FROM lots WHERE qrCode = ?`, [qrCode], (err, row) => {
      if (err) return res.status(500).json({ message: "Lỗi cơ sở dữ liệu" });

      const statusMap = {
        care: "Chăm sóc",
        harvest: "Thu hoạch",
        export: "Xuất hàng",
        quality: "Kiểm tra chất lượng",
        process: "Chế biến",
        storage: "Lưu kho",
        pack: "Đóng gói",
        transport: "Vận chuyển",
        receive: "Nhận hàng",
        sell: "Bán lẻ",
      };

      if (!row && role !== "farmer")
        return res.status(400).json({ message: "Lô chưa được tạo" });

      const dataString = JSON.stringify(formData);
      if (row) {
        db.run(`UPDATE lots SET ${column} = ?, status = ? WHERE qrCode = ?`, [
          dataString,
          statusMap[action] || row.status,
          qrCode,
        ]);
      } else {
        db.run(
          `INSERT INTO lots (qrCode, ${column}, status) VALUES (?, ?, ?)`,
          [qrCode, dataString, statusMap[action]]
        );
      }

      db.run(
        `INSERT INTO history (qrCode, role, action, data, timestamp) VALUES (?, ?, ?, ?, ?)`,
        [qrCode, role, action, dataString, timestamp]
      );

      const mediaUrls = mediaFiles
        ? mediaFiles.map((file) => `/public/uploads/${file.filename}`)
        : [];
      res.json({ message: "Dữ liệu và media đã lưu", qrCode, mediaUrls });
    });
  }
);

// Admin: Thêm người dùng
app.post("/admin/add-user", authenticateToken, (req, res) => {
  if (req.user.role !== "admin") return res.status(403).send("Không có quyền");
  const { username, password, role, info } = req.body;
  bcrypt.hash(password, 10, (err, hash) => {
    if (err) return res.status(500).json({ message: "Lỗi mã hóa mật khẩu" });
    db.run(
      `INSERT INTO users (username, password, role, info) VALUES (?, ?, ?, ?)`,
      [username, hash, role, JSON.stringify(info)],
      (err) => {
        if (err)
          return res.status(500).json({ message: "Lỗi thêm người dùng" });
        res.json({ message: "Người dùng đã thêm" });
      }
    );
  });
});

// Admin: Xóa lô
app.post("/admin/delete-lot", authenticateToken, (req, res) => {
  if (req.user.role !== "admin") return res.status(403).send("Không có quyền");
  const { qrCode } = req.body;
  db.run(`DELETE FROM lots WHERE qrCode = ?`, [qrCode], (err) => {
    if (err) return res.status(500).json({ message: "Lỗi xóa lô" });
    db.run(`DELETE FROM history WHERE qrCode = ?`, [qrCode]);
    res.json({ message: "Lô đã xóa" });
  });
});

app.listen(3000, () => {
  console.log("Server chạy tại http://localhost:3000/login.html");
});
