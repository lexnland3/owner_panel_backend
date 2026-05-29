const Notification = require("../models/Notification");
const Message      = require("../models/Message");

// ════ NOTIFICATIONS ════

exports.getNotifications = async (req, res, next) => {
  try {
    const all = await Notification.find({ owner: req.owner._id }).sort({ createdAt: -1 }).limit(50);

    const now       = new Date();
    const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
    const yestStart  = new Date(todayStart); yestStart.setDate(yestStart.getDate()-1);

    const grouped = {
      today:     all.filter(n => new Date(n.createdAt) >= todayStart),
      yesterday: all.filter(n => new Date(n.createdAt) >= yestStart && new Date(n.createdAt) < todayStart),
      older:     all.filter(n => new Date(n.createdAt) < yestStart),
    };

    res.status(200).json({
      success: true,
      unreadCount: all.filter(n => !n.isRead).length,
      notifications: grouped,
    });
  } catch (err) { next(err); }
};

exports.markRead = async (req, res, next) => {
  try {
    await Notification.findOneAndUpdate({ _id: req.params.id, owner: req.owner._id }, { isRead: true });
    res.status(200).json({ success: true, message: "Marked as read" });
  } catch (err) { next(err); }
};

exports.markAllRead = async (req, res, next) => {
  try {
    await Notification.updateMany({ owner: req.owner._id, isRead: false }, { isRead: true });
    res.status(200).json({ success: true, message: "All marked as read" });
  } catch (err) { next(err); }
};

exports.clearAll = async (req, res, next) => {
  try {
    await Notification.deleteMany({ owner: req.owner._id });
    res.status(200).json({ success: true, message: "All notifications cleared" });
  } catch (err) { next(err); }
};

// ════ MESSAGES ════

exports.getChats = async (req, res, next) => {
  try {
    const chats = await Message.find({ owner: req.owner._id })
      .populate("property", "propertyName")
      .sort({ lastMessageTime: -1 });
    res.status(200).json({ success: true, count: chats.length, chats });
  } catch (err) { next(err); }
};

exports.getChatMessages = async (req, res, next) => {
  try {
    const chat = await Message.findOne({ _id: req.params.chatId, owner: req.owner._id });
    if (!chat) return res.status(404).json({ success: false, message: "Chat not found" });
    chat.unreadCount = 0;
    await chat.save();
    res.status(200).json({ success: true, chat });
  } catch (err) { next(err); }
};

exports.sendReply = async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ success: false, message: "Message text is required" });

    const chat = await Message.findOne({ _id: req.params.chatId, owner: req.owner._id });
    if (!chat) return res.status(404).json({ success: false, message: "Chat not found" });

    chat.messages.push({ text, isOwner: true, timestamp: new Date() });
    chat.lastMessage     = text;
    chat.lastMessageTime = new Date();
    await chat.save();

    res.status(200).json({ success: true, message: "Reply sent", chat });
  } catch (err) { next(err); }
};
