import { useState, useEffect } from "react";
import { ethers } from "ethers";
import dormABI from "./contractABI.json";

// 🚨 ใส่ Contract Address ล่าสุดของคุณ
const contractAddress = "0x6307fEd348704594a7F6f84a95D5a7b4ACe74Ba9";

function App() {
  const [walletAddress, setWalletAddress] = useState("");
  const [role, setRole] = useState("landlord");
  const [isLoading, setIsLoading] = useState(false);

  // ==========================================
  // [Landlord State]
  // ==========================================
  const [roomConfig, setRoomConfig] = useState({
    roomNo: "109", type: "Premier", hasWifi: false
  });
  const [meterForm, setMeterForm] = useState({ prevWater: "", curWater: "", prevElec: "", curElec: "" });
  const [damageFee, setDamageFee] = useState("");

  // 🔥 [NEW] State สำหรับเครื่องมือสร้าง Hash ของ Admin
  const [adminHashTool, setAdminHashTool] = useState("");

  const usedWater = Math.max(0, Number(meterForm.curWater) - Number(meterForm.prevWater));
  const usedElec  = Math.max(0, Number(meterForm.curElec)  - Number(meterForm.prevElec));

  const previewWaterRate = 15;
  const previewElecRate  = 8;

  const [monthlyRentCost, setMonthlyRentCost] = useState(0);
  const wifiAddon       = roomConfig.hasWifi ? 150 : 0;
  const totalPreviewCost = monthlyRentCost + wifiAddon + (usedWater * previewWaterRate) + (usedElec * previewElecRate);

  // ==========================================
  // [Tenant State & Contract Data]
  // ==========================================
  const [billAmount, setBillAmount]   = useState("0");
  const [isLate, setIsLate]           = useState(false);
  const [breakdown, setBreakdown]     = useState({ rent: "0", water: "0", electric: "0", penalty: "0", deposit: "0" });
  const [contractActive, setContractActive] = useState(true);

  // 🔥 [NEW] State สำหรับตรวจสอบไฟล์ PDF ฝั่งผู้เช่า
  const [verification, setVerification] = useState({ hash: "", status: null });

  const [contractInfo, setContractInfo] = useState({
    roomType:        "",   
    wifiIncluded:    false,
    wifiRate:        "0",
    monthsRemaining: 0,
    monthsElapsed:   0,
    duration:        0,
    startDate:       "",
    endDate:         "",
    contractHash:    "", // 🔥 เก็บค่า Hash จาก Blockchain
  });

  // ==========================================
  // Helpers
  // ==========================================
  const getCurrentDateTH = () => {
    const d = new Date();
    const months = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
  };

  const generateBillId = () => {
    const d = new Date();
    return `INV-${roomConfig.roomNo}-${d.getFullYear()}${(d.getMonth()+1).toString().padStart(2,"0")}`;
  };

  const formatMoney = (weiString) => {
    if (!weiString || weiString === "0") return "0 บาท";
    const baht     = Number(weiString).toLocaleString();
    const shortEth = Number(ethers.formatEther(weiString)).toFixed(8).replace(/\.?0+$/,"");
    return `${baht} บาท (≈ ${shortEth} ETH)`;
  };

  const formatBahtOnly = (v) => {
    if (!v || v === "0") return "0";
    return Number(v).toLocaleString();
  };

  const tsToTH = (ts) => {
    const d      = new Date(Number(ts) * 1000);
    const months = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
  };

  // 🔥 [NEW] ฟังก์ชันแปลงไฟล์ PDF เป็น Hash 256
  const getFileHash = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return "0x" + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  // Admin ใช้สร้าง Hash ก่อน Deploy
  const handleAdminHashTool = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const hashHex = await getFileHash(file);
    setAdminHashTool(hashHex);
  };

  // Tenant ใช้ตรวจสอบสัญญา
  const handleVerifyPDF = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsLoading(true);
    try {
        const hashHex = await getFileHash(file);
        // ตรวจสอบกับ Hash ที่บันทึกไว้ใน Blockchain
        if (hashHex === contractInfo.contractHash) {
            setVerification({ hash: hashHex, status: "success" });
        } else {
            setVerification({ hash: hashHex, status: "failed" });
        }
    } catch (err) {
        console.error(err);
    }
    setIsLoading(false);
  };

  // ==========================================
  // Mock Data (ข้อมูลตาราง)
  // ==========================================
  const mockRoomsOverview = [
    { room:"101", tenant:"0xB5E0...87aA", status:"Unpaid",  dueDate:"20 เม.ย. 2569", amount:"5144" },
    { room:"102", tenant:"0x1234...5678", status:"Paid",    dueDate:"-",              amount:"0"    },
    { room:"109", tenant:"0xabcd...efgh", status:"Partial", dueDate:"22 เม.ย. 2569", amount:"2000" },
  ];
  const mockAdminTxHistory = [
    { date:"15 เม.ย. 2569", room:"101", txId:"0x8f2a...c91b", type:"ชำระค่าเช่า", amount:"5144", status:"Success" },
    { date:"10 เม.ย. 2569", room:"102", txId:"0x3e1d...f84a", type:"เงินประกัน",  amount:"5000", status:"Success" },
  ];
  const mockTenantHistory = [
    { month:"มีนาคม 2569", invoice:"INV-109-202603", txId:"0x1a2b...3c4d", amount:"5100", status:"Paid" },
  ];

  // ==========================================
  // Core Functions
  // ==========================================
  async function connectWallet() {
    if (!window.ethereum) return alert("กรุณาติดตั้ง MetaMask!");
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer   = await provider.getSigner();
    setWalletAddress(await signer.getAddress());
  }

  async function getContract() {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer   = await provider.getSigner();
    return new ethers.Contract(contractAddress, dormABI, signer);
  }

  const handleInputChange  = (e) => setMeterForm({ ...meterForm, [e.target.name]: e.target.value });
  const handleConfigChange = (e) => {
    const v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setRoomConfig({ ...roomConfig, [e.target.name]: v });
  };

  async function handleGenerateBill(e) {
    e.preventDefault();
    if (!meterForm.curWater || !meterForm.curElec) return alert("กรุณากรอกเลขมิเตอร์ให้ครบ");
    try {
      setIsLoading(true);
      const contract = await getContract();
      const tx = await contract.generateBill(usedWater, usedElec);
      await tx.wait();
      alert("🎉 สร้างบิลลง Blockchain สำเร็จ!");
      setMeterForm({ prevWater: meterForm.curWater, curWater: "", prevElec: meterForm.curElec, curElec: "" });
    } catch (err) { alert("❌ เกิดข้อผิดพลาดในการออกบิล (อาจจะค้างจ่าย หรือใช้กระเป๋าผิด)"); }
    finally { setIsLoading(false); }
  }

  async function handleEndContract() {
    if (!window.confirm("คุณแน่ใจหรือไม่ที่จะสิ้นสุดสัญญานี้? เงินประกันจะถูกโอนคืนผู้เช่าอัตโนมัติ")) return;
    try {
      setIsLoading(true);
      const contract = await getContract();
      const tx = await contract.endContract(damageFee || 0);
      await tx.wait();
      alert("✅ สิ้นสุดสัญญาและคืนเงินประกันเรียบร้อยแล้ว!");
      setContractActive(false);
    } catch (err) { alert("❌ ปิดสัญญาไม่สำเร็จ"); }
    finally { setIsLoading(false); }
  }

  async function handlePayRent() {
    try {
      setIsLoading(true);
      const contract   = await getContract();
      const amountWei  = await contract.totalAmountToPay();
      const tx         = await contract.payRent({ value: amountWei });
      await tx.wait();
      alert("✅ ชำระเงินสำเร็จ!");
      setBillAmount("0"); setIsLate(false);
    } catch (err) { alert("❌ ชำระเงินล้มเหลว"); }
    finally { setIsLoading(false); }
  }

  useEffect(() => {
    async function fetchAll() {
      if (!walletAddress) return;
      try {
        const contract = await getContract();

        const active     = await contract.isActive();
        const status     = await contract.paymentStatus();
        const depositWei = await contract.securityDeposit();
        const rentWei    = await contract.monthlyRent();
        setContractActive(active);
        setMonthlyRentCost(Number(rentWei));

        try {
          const roomType         = await contract.roomType();
          const wifiIncluded     = await contract.wifiIncluded();
          const wifiRate         = await contract.wifiRate();
          const monthsRemaining  = await contract.monthsRemaining();
          const monthsElapsed    = await contract.monthsElapsed();
          const duration         = await contract.contractDuration();
          const startTs          = await contract.contractStartDate();
          
          // 🔥 ดึง Hash จาก Blockchain มาเก็บไว้เทียบ
          const hashOnChain      = await contract.contractHash();

          const endTs = Number(startTs) + (Number(duration) * 30 * 24 * 60 * 60);

          setContractInfo({
            roomType:        roomType,
            wifiIncluded:    wifiIncluded,
            wifiRate:        wifiRate.toString(),
            monthsRemaining: Number(monthsRemaining),
            monthsElapsed:   Number(monthsElapsed),
            duration:        Number(duration),
            startDate:       tsToTH(startTs),
            endDate:         tsToTH(endTs.toString()),
            contractHash:    hashOnChain, // เก็บค่าลง State
          });
        } catch { }

        if (status === 1n || !active) {
          setBillAmount("0"); setIsLate(false);
          setBreakdown(prev => ({ ...prev, deposit: depositWei.toString() }));
        } else {
          const amountWei = await contract.totalAmountToPay();
          const baseWei   = await contract.baseBillAmount();
          setBillAmount(amountWei.toString());
          setIsLate(amountWei > baseWei);
          setBreakdown({
            rent:    rentWei.toString(),
            water:   (await contract.waterCost()).toString(),
            electric:(await contract.electricCost()).toString(),
            penalty: (amountWei > baseWei ? amountWei - baseWei : 0n).toString(),
            deposit: depositWei.toString(),
          });
        }
      } catch (err) { console.error(err); }
    }
    fetchAll();
  }, [role, walletAddress]);

  useEffect(() => {
    if (window.ethereum)
      window.ethereum.on("accountsChanged", (accounts) => setWalletAddress(accounts[0] || ""));
  }, []);

  // ==========================================
  // UI Styles
  // ==========================================
  const colors = {
    bgMain:    "#1a1a24", bgSidebar: "#13131a", bgCard: "#222230", bgInput: "#181822",
    border:    "#333344", textPrimary: "#ffffff", textDim: "#a1a1aa",
    accentWater: "#38bdf8", accentElec: "#fbbf24",
  };

  const TH = ({ children }) => (
    <th style={{ padding:"12px", textAlign:"left", color:colors.textDim, borderBottom:`1px solid ${colors.border}`, fontSize:"13px" }}>{children}</th>
  );
  const TD = ({ children }) => (
    <td style={{ padding:"12px", borderBottom:`1px solid ${colors.border}`, fontSize:"14px" }}>{children}</td>
  );

  const RoomInfoCards = ({ showTitle = true }) => {
    const pct = contractInfo.duration > 0 ? Math.round((contractInfo.monthsElapsed / contractInfo.duration) * 100) : 0;
    const isNearEnd = contractInfo.monthsRemaining <= 2 && contractInfo.monthsRemaining > 0;
    const isEnded = contractInfo.monthsRemaining === 0;

    return (
      <div style={{ backgroundColor: colors.bgCard, borderRadius:"16px", padding:"25px", border:`1px solid ${colors.border}` }}>
        {showTitle && <h3 style={{ margin:"0 0 20px 0", fontSize:"18px" }}>🏠 ข้อมูลห้องและสัญญาเช่า</h3>}
        <div style={{ display:"flex", gap:"15px", flexWrap:"wrap", marginBottom:"20px" }}>
          
          <div style={{ flex:1, minWidth:"140px", backgroundColor:colors.bgInput, padding:"18px", borderRadius:"12px", textAlign:"center", border: contractInfo.roomType === "AIR" ? "1px solid rgba(56,189,248,0.4)" : "1px solid rgba(251,191,36,0.4)" }}>
            <div style={{ fontSize:"32px", marginBottom:"8px" }}>{contractInfo.roomType === "AIR" ? "❄️" : "🌀"}</div>
            <div style={{ fontSize:"11px", color:colors.textDim, marginBottom:"4px" }}>ประเภทห้อง</div>
            <div style={{ fontWeight:"bold", fontSize:"15px", color: contractInfo.roomType === "AIR" ? "#38bdf8" : "#fbbf24" }}>{contractInfo.roomType === "AIR" ? "ห้องแอร์" : "ห้องพัดลม"}</div>
            <div style={{ fontSize:"11px", color:colors.textDim, marginTop:"6px" }}>{contractInfo.roomType === "AIR" ? "รวม Air Conditioner" : "ไม่มีแอร์"}</div>
          </div>

          <div style={{ flex:1, minWidth:"140px", backgroundColor:colors.bgInput, padding:"18px", borderRadius:"12px", textAlign:"center", border: contractInfo.wifiIncluded ? "1px solid rgba(16,185,129,0.4)" : `1px solid ${colors.border}` }}>
            <div style={{ fontSize:"32px", marginBottom:"8px" }}>{contractInfo.wifiIncluded ? "📶" : "🚫"}</div>
            <div style={{ fontSize:"11px", color:colors.textDim, marginBottom:"4px" }}>อินเทอร์เน็ต (Wi-Fi)</div>
            <div style={{ fontWeight:"bold", fontSize:"15px", color: contractInfo.wifiIncluded ? "#10b981" : colors.textDim }}>{contractInfo.wifiIncluded ? "รวมแล้ว" : "ไม่รวม"}</div>
            <div style={{ fontSize:"11px", color:colors.textDim, marginTop:"6px" }}>{contractInfo.wifiIncluded ? `${Number(contractInfo.wifiRate).toLocaleString()} บาท/เดือน` : "ชำระแยกต่างหาก"}</div>
          </div>

          <div style={{ flex:1, minWidth:"140px", backgroundColor:colors.bgInput, padding:"18px", borderRadius:"12px", textAlign:"center", border: isNearEnd ? "1px solid rgba(239,68,68,0.5)" : isEnded ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(16,185,129,0.4)" }}>
            <div style={{ fontSize:"32px", marginBottom:"8px" }}>📅</div>
            <div style={{ fontSize:"11px", color:colors.textDim, marginBottom:"4px" }}>สัญญาเหลืออีก</div>
            <div style={{ fontWeight:"bold", fontSize:"22px", color: isEnded ? "#ef4444" : isNearEnd ? "#f59e0b" : "#10b981" }}>{contractInfo.monthsRemaining}</div>
            <div style={{ fontSize:"12px", color:colors.textDim }}>เดือน / {contractInfo.duration} เดือน</div>
            {isNearEnd && <div style={{ fontSize:"10px", color:"#ef4444", marginTop:"6px", fontWeight:"bold", backgroundColor:"rgba(239,68,68,0.1)", padding:"3px 8px", borderRadius:"4px" }}>⚠️ ใกล้หมดสัญญา!</div>}
            {isEnded && <div style={{ fontSize:"10px", color:"#ef4444", marginTop:"6px", fontWeight:"bold" }}>หมดสัญญาแล้ว</div>}
          </div>
        </div>

        <div style={{ marginBottom:"15px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:"12px", color:colors.textDim, marginBottom:"6px" }}>
            <span>เริ่ม: {contractInfo.startDate}</span>
            <span>ผ่านมาแล้ว {contractInfo.monthsElapsed} เดือน ({pct}%)</span>
            <span>สิ้นสุด: {contractInfo.endDate}</span>
          </div>
          <div style={{ height:"6px", backgroundColor:colors.border, borderRadius:"99px", overflow:"hidden" }}>
            <div style={{ height:"100%", borderRadius:"99px", width:`${pct}%`, backgroundColor: pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "#10b981", transition:"width 0.6s ease" }} />
          </div>
        </div>

        <div style={{ backgroundColor:colors.bgInput, borderRadius:"10px", padding:"15px" }}>
          <div style={{ fontSize:"12px", color:colors.textDim, marginBottom:"10px", fontWeight:"bold" }}>📋 สรุปค่าใช้จ่ายรายเดือน (ตามสัญญา)</div>
          <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
            <Row label="ค่าเช่าห้อง" value={`${formatBahtOnly(monthlyRentCost)} บาท`} />
            <Row label={`Wi-Fi${contractInfo.wifiIncluded ? " (รวมแล้ว)" : " (ไม่รวม)"}`} value={contractInfo.wifiIncluded ? `${Number(contractInfo.wifiRate).toLocaleString()} บาท` : "-"} color={contractInfo.wifiIncluded ? "#10b981" : colors.textDim} />
            <Row label="ค่าน้ำ (ต่อหน่วย)"  value={`${previewWaterRate} บาท/หน่วย`} />
            <Row label="ค่าไฟ (ต่อหน่วย)"   value={`${previewElecRate} บาท/หน่วย`} />
            <div style={{ borderTop:`1px dashed ${colors.border}`, paddingTop:"8px", marginTop:"4px" }}>
              <Row label="ค่าเช่ารวม Wi-Fi (ขั้นต่ำ/เดือน)" value={`${formatBahtOnly(monthlyRentCost + Number(contractInfo.wifiIncluded ? contractInfo.wifiRate : 0))} บาท`} bold />
            </div>
          </div>
        </div>
      </div>
    );
  };

  const Row = ({ label, value, bold=false, color="" }) => (
    <div style={{ display:"flex", justifyContent:"space-between", fontSize:"13px" }}>
      <span style={{ color:colors.textDim }}>{label}</span>
      <span style={{ fontWeight: bold ? "bold" : "normal", color: color || (bold ? "white" : "white") }}>{value}</span>
    </div>
  );

  // ==========================================
  // RENDER
  // ==========================================
  return (
    <div style={{ display:"flex", height:"100vh", backgroundColor:colors.bgMain, color:colors.textPrimary, fontFamily:"'Inter', sans-serif" }}>

      {/* Sidebar */}
      <div style={{ width:"80px", backgroundColor:colors.bgSidebar, display:"flex", flexDirection:"column", alignItems:"center", padding:"20px 0", borderRight:`1px solid ${colors.border}` }}>
        <div style={{ fontSize:"28px", marginBottom:"40px" }}>🏢</div>
        <div onClick={() => setRole("landlord")} style={{ display:"flex", flexDirection:"column", alignItems:"center", marginBottom:"30px", cursor:"pointer", color: role === "landlord" ? "#3b82f6" : colors.textDim }}>
          <div style={{ fontSize:"24px" }}>🛡️</div>
          <span style={{ fontSize:"10px", marginTop:"5px" }}>Admin</span>
        </div>
        <div onClick={() => setRole("tenant")} style={{ display:"flex", flexDirection:"column", alignItems:"center", marginBottom:"30px", cursor:"pointer", color: role === "tenant" ? "#10b981" : colors.textDim }}>
          <div style={{ fontSize:"24px" }}>🧑‍💻</div>
          <span style={{ fontSize:"10px", marginTop:"5px" }}>Tenant</span>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflowY:"auto" }}>

        <div style={{ padding:"20px 40px", display:"flex", justifyContent:"space-between", alignItems:"center", borderBottom:`1px solid ${colors.border}`, backgroundColor:colors.bgSidebar }}>
          <div>
            <h2 style={{ margin:0, fontSize:"20px", fontWeight:"600" }}>หอพัก Blockchain</h2>
            <div style={{ fontSize:"12px", color:colors.textDim }}>Decentralized Dormitory System</div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:"15px", backgroundColor:colors.bgCard, padding:"10px 20px", borderRadius:"30px", border:`1px solid ${colors.border}` }}>
            <div style={{ width:"35px", height:"35px", borderRadius:"50%", backgroundColor:"#4f46e5", display:"flex", justifyContent:"center", alignItems:"center", fontSize:"18px" }}>👤</div>
            <div>
              <div style={{ fontSize:"14px", fontWeight:"bold" }}>{role === "landlord" ? "ผู้ดูแลหอพัก (Admin)" : `ผู้เช่า (ห้อง ${roomConfig.roomNo})`}</div>
              <div style={{ fontSize:"12px", color:colors.textDim }}>{walletAddress ? `${walletAddress.slice(0,6)}...${walletAddress.slice(-4)}` : <span onClick={connectWallet} style={{ cursor:"pointer", color:"#3b82f6" }}>คลิกเชื่อมต่อ Wallet</span>}</div>
            </div>
          </div>
        </div>

        <div style={{ padding:"30px 40px", maxWidth:"1200px" }}>

          {/* ================= LANDLORD VIEW ================= */}
          {role === "landlord" && (
            <div style={{ display:"flex", flexDirection:"column", gap:"25px" }}>

              {/* เครื่องมือสร้าง Hash สำหรับ Admin ก่อนนำไป Deploy */}
              <div style={{ backgroundColor:"rgba(56, 189, 248, 0.05)", borderRadius:"16px", padding:"25px", border:"1px solid rgba(56, 189, 248, 0.3)" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"15px" }}>
                  <h3 style={{ margin:0, fontSize:"18px", color:"#38bdf8" }}>🖨️ เครื่องมือแปลงไฟล์สัญญาเป็น Hash (ก่อน Deploy)</h3>
                </div>
                <p style={{ fontSize:"13px", color:colors.textDim, marginBottom:"15px" }}>อัปโหลดไฟล์ PDF สัญญาเช่าตัวจริง เพื่อรับรหัส Hash ไปกรอกในช่อง <code>_contractHash</code> ตอน Deploy สัญญาใน Remix</p>
                <div style={{ display:"flex", gap:"15px", alignItems:"center" }}>
                  <input type="file" accept=".pdf" onChange={handleAdminHashTool} style={{ backgroundColor:colors.bgInput, color:"white", padding:"10px", borderRadius:"8px", border:`1px solid ${colors.border}` }} />
                  {adminHashTool && (
                    <div style={{ flex:1, backgroundColor:"#1e293b", padding:"12px 15px", borderRadius:"8px", border:"1px solid #38bdf8", color:"#38bdf8", wordBreak:"break-all", fontSize:"12px", fontFamily:"monospace" }}>
                      {adminHashTool}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display:"flex", gap:"20px", flexWrap:"wrap" }}>
                <div style={{ flex:2, backgroundColor:colors.bgCard, borderRadius:"16px", padding:"25px", border:`1px solid ${colors.border}` }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"20px" }}>
                    <h3 style={{ margin:0, fontSize:"18px" }}>⚙️ ตั้งค่าห้อง (สำหรับอ้างอิงบิล)</h3>
                    {contractActive ? <span style={{ backgroundColor:"rgba(16,185,129,0.2)", color:"#10b981", padding:"5px 12px", borderRadius:"6px", fontSize:"12px", fontWeight:"bold" }}>✅ สัญญา Active</span> : <span style={{ backgroundColor:"rgba(239,68,68,0.2)", color:"#ef4444", padding:"5px 12px", borderRadius:"6px", fontSize:"12px", fontWeight:"bold" }}>❌ สัญญา Ended</span>}
                  </div>
                  <div style={{ display:"flex", gap:"15px", flexWrap:"wrap" }}>
                    <input type="text" name="roomNo" value={roomConfig.roomNo} onChange={handleConfigChange} placeholder="เลขห้อง" style={{ flex:1, backgroundColor:colors.bgInput, border:`1px solid ${colors.border}`, color:"white", padding:"12px", borderRadius:"8px" }} />
                    <select name="type" value={roomConfig.type} onChange={handleConfigChange} style={{ flex:1, backgroundColor:colors.bgInput, border:`1px solid ${colors.border}`, color:"white", padding:"12px", borderRadius:"8px" }}>
                      <option value="Standard">Standard</option>
                      <option value="Premier">Premier</option>
                    </select>
                    <label style={{ display:"flex", alignItems:"center", gap:"10px", backgroundColor:colors.bgInput, border:`1px solid ${colors.border}`, padding:"0 15px", borderRadius:"8px", cursor:"pointer" }}>
                      <input type="checkbox" name="hasWifi" checked={roomConfig.hasWifi} onChange={handleConfigChange} style={{ width:"18px", height:"18px" }} />
                      <span style={{ fontSize:"14px" }}>รวม Wi-Fi</span>
                    </label>
                  </div>
                </div>

                <div style={{ flex:1, backgroundColor:"rgba(239,68,68,0.05)", borderRadius:"16px", padding:"25px", border:"1px solid rgba(239,68,68,0.3)" }}>
                  <h3 style={{ margin:"0 0 15px 0", fontSize:"18px", color:"#ef4444" }}>🔒 สิ้นสุดสัญญาเช่า</h3>
                  <p style={{ fontSize:"12px", color:colors.textDim, marginBottom:"15px" }}>ระบุค่าเสียหายที่ต้องการหัก (ถ้ามี) ระบบจะคืนเงินประกันส่วนที่เหลืออัตโนมัติ</p>
                  <div style={{ display:"flex", gap:"10px" }}>
                    <input type="number" placeholder="ค่าเสียหาย (บาท)" value={damageFee} onChange={(e) => setDamageFee(e.target.value)} style={{ flex:1, backgroundColor:colors.bgInput, border:`1px solid ${colors.border}`, color:"white", padding:"10px", borderRadius:"8px" }} />
                    <button onClick={handleEndContract} disabled={isLoading || !contractActive} style={{ padding:"10px 15px", backgroundColor:"#ef4444", color:"white", border:"none", borderRadius:"8px", fontWeight:"bold", cursor:(!contractActive || isLoading) ? "not-allowed" : "pointer" }}>ปิดสัญญา</button>
                  </div>
                </div>
              </div>

              <RoomInfoCards />

              {/* 🔥 เพิ่มตาราง Overview สำหรับ Admin กลับเข้ามาแล้ว! */}
              <div style={{ backgroundColor:colors.bgCard, borderRadius:"16px", padding:"25px", border:`1px solid ${colors.border}` }}>
                <h3 style={{ margin:"0 0 20px 0", fontSize:"18px" }}>📊 สถานะห้องพักทั้งหมด (Overview)</h3>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead>
                    <tr>
                      <TH>ห้อง</TH><TH>ผู้เช่า (Address)</TH>
                      <TH>ยอดค้างชำระ</TH><TH>กำหนดชำระ</TH><TH>สถานะ</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {mockRoomsOverview.map((r, i) => (
                      <tr key={i}>
                        <TD><b>{r.room}</b></TD>
                        <TD><span style={{ color:"#38bdf8" }}>{r.tenant}</span></TD>
                        <TD>{formatBahtOnly(r.amount)} บาท</TD>
                        <TD>{r.dueDate}</TD>
                        <TD>
                          <span style={{ padding:"4px 10px", borderRadius:"4px", fontSize:"12px", fontWeight:"bold",
                            backgroundColor: r.status==="Paid" ? "rgba(16,185,129,0.2)" : r.status==="Unpaid" ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.2)",
                            color: r.status==="Paid" ? "#10b981" : r.status==="Unpaid" ? "#ef4444" : "#f59e0b" }}>
                            {r.status}
                          </span>
                        </TD>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display:"flex", gap:"20px", flexWrap:"wrap" }}>
                <div style={{ flex:2, backgroundColor:colors.bgCard, borderRadius:"16px", padding:"25px", border:`1px solid ${colors.border}` }}>
                  <h3 style={{ margin:"0 0 20px 0", fontSize:"18px" }}>📝 บันทึกมิเตอร์ (ห้อง {roomConfig.roomNo})</h3>
                  <div style={{ display:"flex", gap:"30px" }}>
                    <div style={{ flex:1 }}>
                      <div style={{ color:colors.accentWater, marginBottom:"10px" }}>💧 ค่าน้ำ (หน่วยละ {previewWaterRate} บ.)</div>
                      <input type="number" name="prevWater" placeholder="มิเตอร์ก่อน" value={meterForm.prevWater} onChange={handleInputChange} style={{ width:"100%", backgroundColor:colors.bgInput, border:`1px solid ${colors.border}`, color:"white", padding:"10px", borderRadius:"8px", marginBottom:"10px" }} />
                      <input type="number" name="curWater" placeholder="มิเตอร์หลัง" value={meterForm.curWater} onChange={handleInputChange} style={{ width:"100%", backgroundColor:colors.bgInput, border:`1px solid ${colors.border}`, color:"white", padding:"10px", borderRadius:"8px" }} />
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ color:colors.accentElec, marginBottom:"10px" }}>⚡ ค่าไฟ (หน่วยละ {previewElecRate} บ.)</div>
                      <input type="number" name="prevElec" placeholder="มิเตอร์ก่อน" value={meterForm.prevElec} onChange={handleInputChange} style={{ width:"100%", backgroundColor:colors.bgInput, border:`1px solid ${colors.border}`, color:"white", padding:"10px", borderRadius:"8px", marginBottom:"10px" }} />
                      <input type="number" name="curElec" placeholder="มิเตอร์หลัง" value={meterForm.curElec} onChange={handleInputChange} style={{ width:"100%", backgroundColor:colors.bgInput, border:`1px solid ${colors.border}`, color:"white", padding:"10px", borderRadius:"8px" }} />
                    </div>
                  </div>
                </div>

                <div style={{ flex:1, backgroundColor:colors.bgCard, borderRadius:"16px", padding:"25px", border:`1px solid ${colors.border}`, display:"flex", flexDirection:"column" }}>
                  <h3 style={{ margin:"0 0 20px 0", fontSize:"18px" }}>สรุปยอด (Preview)</h3>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"10px" }}><span style={{ color:colors.textDim }}>ค่าห้อง (อิงจากสัญญา)</span><span style={{ color:"#38bdf8", fontWeight:"bold" }}>{formatBahtOnly(monthlyRentCost)} บ.</span></div>
                  {contractInfo.wifiIncluded && <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"10px" }}><span style={{ color:colors.textDim }}>ค่า Wi-Fi</span><span style={{ color:"#10b981" }}>{Number(contractInfo.wifiRate).toLocaleString()} บ.</span></div>}
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"10px" }}><span style={{ color:colors.textDim }}>ค่าน้ำ</span><span>{formatBahtOnly(usedWater * previewWaterRate)} บ.</span></div>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"20px" }}><span style={{ color:colors.textDim }}>ค่าไฟ</span><span>{formatBahtOnly(usedElec * previewElecRate)} บ.</span></div>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:"18px", fontWeight:"bold", paddingTop:"15px", borderTop:`1px solid ${colors.border}` }}><span>Total</span><span style={{ color:"#10b981" }}>{formatBahtOnly(totalPreviewCost)} บ.</span></div>
                  <button onClick={handleGenerateBill} disabled={isLoading || !contractActive} style={{ width:"100%", padding:"15px", backgroundColor:"white", color:"black", fontSize:"14px", fontWeight:"bold", border:"none", borderRadius:"8px", cursor:(!contractActive || isLoading) ? "not-allowed" : "pointer", marginTop:"auto" }}>{isLoading ? "Processing..." : "สร้างบิล (Generate Bill)"}</button>
                </div>
              </div>

              {/* 🔥 เพิ่มตาราง Transaction History สำหรับ Admin กลับเข้ามาแล้ว! */}
              <div style={{ backgroundColor:colors.bgCard, borderRadius:"16px", padding:"25px", border:`1px solid ${colors.border}` }}>
                <h3 style={{ margin:"0 0 20px 0", fontSize:"18px" }}>⛓️ ประวัติธุรกรรม Blockchain (Transaction History)</h3>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead>
                    <tr>
                      <TH>วันที่</TH><TH>ห้อง</TH><TH>ประเภท</TH>
                      <TH>ยอดเงิน (บาท)</TH><TH>TxID (Hash)</TH><TH>สถานะ</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {mockAdminTxHistory.map((tx, i) => (
                      <tr key={i}>
                        <TD>{tx.date}</TD><TD>{tx.room}</TD><TD>{tx.type}</TD>
                        <TD>{formatBahtOnly(tx.amount)}</TD>
                        <TD><a href="#" style={{ color:"#38bdf8", textDecoration:"none" }}>{tx.txId}</a></TD>
                        <TD><span style={{ color:"#10b981", fontWeight:"bold" }}>{tx.status}</span></TD>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </div>
          )}

          {/* ================= TENANT VIEW ================= */}
          {role === "tenant" && (
            <div style={{ display:"flex", flexDirection:"column", gap:"25px", maxWidth:"800px", margin:"0 auto" }}>

              <RoomInfoCards />

              {/* กล่องตรวจสอบเอกสารสัญญาสำหรับผู้เช่า */}
              <div style={{ backgroundColor:colors.bgCard, borderRadius:"16px", padding:"25px", border:`1px solid ${colors.border}` }}>
                <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"15px" }}>
                  <span style={{ fontSize:"24px" }}>🔍</span>
                  <h3 style={{ margin:0, fontSize:"18px" }}>ตรวจสอบความโปร่งใสของเอกสารสัญญา</h3>
                </div>
                <p style={{ fontSize:"13px", color:colors.textDim, marginBottom:"20px" }}>
                  อัปโหลดไฟล์สัญญาเช่าแบบ PDF เพื่อใช้ระบบ Digital Signature ตรวจสอบกับค่า Hash บน Blockchain ว่าเนื้อหาในสัญญาเคยถูกแอบแก้ไขหรือไม่
                </p>
                <div style={{ display:"flex", gap:"15px", alignItems:"flex-start", flexWrap:"wrap" }}>
                  <input type="file" accept=".pdf" onChange={handleVerifyPDF} style={{ flex:1, backgroundColor:colors.bgInput, color:"white", padding:"12px", borderRadius:"8px", border:`1px solid ${colors.border}`, cursor:"pointer" }} />
                  
                  {/* แสดงผลลัพธ์การตรวจสอบ */}
                  {verification.status === "success" && (
                    <div style={{ flex:1, backgroundColor:"rgba(16, 185, 129, 0.1)", border:"1px solid #10b981", borderRadius:"8px", padding:"12px 15px", color:"#10b981" }}>
                      <div style={{ fontWeight:"bold", marginBottom:"4px" }}>✅ เอกสารถูกต้อง 100%</div>
                      <div style={{ fontSize:"11px" }}>รหัสบน Blockchain: {verification.hash.slice(0,10)}...{verification.hash.slice(-10)}</div>
                    </div>
                  )}
                  {verification.status === "failed" && (
                    <div style={{ flex:1, backgroundColor:"rgba(239, 68, 68, 0.1)", border:"1px solid #ef4444", borderRadius:"8px", padding:"12px 15px", color:"#ef4444" }}>
                      <div style={{ fontWeight:"bold", marginBottom:"4px" }}>❌ เอกสารถูกดัดแปลง / ไม่ตรงกับต้นฉบับ</div>
                      <div style={{ fontSize:"11px" }}>รหัสไฟล์ที่อัปโหลดไม่ตรงกับบน Blockchain</div>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display:"flex", gap:"25px", alignItems:"flex-start" }}>
                <div style={{ flex:2, backgroundColor:colors.bgCard, borderRadius:"16px", padding:"35px", border:`1px solid ${colors.border}` }}>
                  <div style={{ textAlign:"center", borderBottom:`1px dashed ${colors.border}`, paddingBottom:"20px", marginBottom:"25px" }}>
                    <h2 style={{ color:"#10b981", margin:"0 0 10px 0" }}>🧾 ใบแจ้งหนี้ (Invoice)</h2>
                    <div style={{ fontSize:"18px", fontWeight:"bold" }}>ห้อง {roomConfig.roomNo}</div>
                    <div style={{ fontSize:"13px", color:colors.textDim, marginTop:"4px" }}>{contractInfo.roomType === "AIR" ? "❄️ ห้องแอร์" : "🌀 ห้องพัดลม"}{contractInfo.wifiIncluded ? "  •  📶 รวม Wi-Fi" : ""}</div>
                  </div>

                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"30px", backgroundColor:colors.bgInput, padding:"15px", borderRadius:"8px" }}>
                    <div><div style={{ color:colors.textDim, fontSize:"12px", marginBottom:"5px" }}>รหัสบิล (Bill ID)</div><div style={{ fontSize:"14px", fontWeight:"bold", color:"#38bdf8" }}>{generateBillId()}</div></div>
                    <div style={{ textAlign:"right" }}><div style={{ color:colors.textDim, fontSize:"12px", marginBottom:"5px" }}>วันที่ออกบิล</div><div style={{ fontSize:"14px", fontWeight:"bold" }}>{getCurrentDateTH()}</div></div>
                  </div>

                  {billAmount !== "0" ? (
                    <div>
                      <div style={{ textAlign:"center", marginBottom:"30px" }}>
                        <div style={{ color:colors.textDim, fontSize:"14px", marginBottom:"10px" }}>ยอดที่ต้องชำระ (Total Amount)</div>
                        <h1 style={{ fontSize:"28px", margin:0, color:"#10b981" }}>{formatMoney(billAmount)}</h1>
                      </div>
                      <div style={{ padding:"0 10px", marginBottom:"35px" }}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"15px", fontSize:"15px" }}><span style={{ color:colors.textDim }}>ค่าเช่าห้อง:</span><span>{formatMoney(breakdown.rent)}</span></div>
                        {contractInfo.wifiIncluded && <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"15px", fontSize:"15px" }}><span style={{ color:"#10b981" }}>📶 ค่า Wi-Fi (รวมแล้ว):</span><span style={{ color:"#10b981" }}>{Number(contractInfo.wifiRate).toLocaleString()} บาท</span></div>}
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"15px", fontSize:"15px" }}><span style={{ color:colors.accentWater }}>ค่าน้ำประปา:</span><span>{formatMoney(breakdown.water)}</span></div>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"15px", fontSize:"15px" }}><span style={{ color:colors.accentElec }}>ค่าไฟฟ้า:</span><span>{formatMoney(breakdown.electric)}</span></div>
                        {isLate && <div style={{ display:"flex", justifyContent:"space-between", color:"#ef4444", fontWeight:"bold", paddingTop:"15px", borderTop:`1px solid ${colors.border}` }}><span>ค่าปรับล่าช้า (5%):</span><span>+{formatMoney(breakdown.penalty)}</span></div>}
                      </div>
                      <button onClick={handlePayRent} disabled={isLoading || !contractActive} style={{ width:"100%", padding:"18px", backgroundColor:"#10b981", color:"white", fontSize:"16px", fontWeight:"bold", border:"none", borderRadius:"8px", cursor:(!contractActive || isLoading) ? "not-allowed" : "pointer" }}>{isLoading ? "Processing..." : "ชำระเงินผ่าน Smart Contract"}</button>
                    </div>
                  ) : (
                    <div style={{ textAlign:"center", padding:"30px 0" }}>
                      <div style={{ fontSize:"50px", marginBottom:"15px" }}>🎉</div>
                      <h3 style={{ margin:0, color:"#10b981" }}>{contractActive ? "ไม่มียอดค้างชำระ" : "สัญญาสิ้นสุดแล้ว"}</h3>
                      <p style={{ color:colors.textDim, fontSize:"14px", marginTop:"10px" }}>{contractActive ? "คุณได้ชำระบิลประจำเดือนนี้เรียบร้อยแล้ว" : "มีการเคลียร์เงินประกันเรียบร้อยแล้ว"}</p>
                    </div>
                  )}
                </div>

                <div style={{ flex:1, backgroundColor:"rgba(245,158,11,0.05)", borderRadius:"16px", padding:"25px", border:"1px solid rgba(245,158,11,0.3)", textAlign:"center" }}>
                  <div style={{ fontSize:"40px", marginBottom:"10px" }}>🔐</div>
                  <h3 style={{ margin:"0 0 10px 0", color:"#f59e0b", fontSize:"16px" }}>Escrow Smart Contract</h3>
                  <p style={{ fontSize:"12px", color:colors.textDim, marginBottom:"20px" }}>เงินประกันของคุณถูกล็อกไว้อย่างปลอดภัยบน Blockchain ไม่มีใครถอนออกไปใช้ได้</p>
                  <div style={{ backgroundColor:"rgba(245,158,11,0.1)", padding:"15px", borderRadius:"8px" }}>
                    <div style={{ fontSize:"12px", color:"#f59e0b", marginBottom:"5px", fontWeight:"bold" }}>ยอดเงินประกัน (Security Deposit)</div>
                    <div style={{ fontSize:"16px", fontWeight:"bold" }}>{formatMoney(breakdown.deposit)}</div>
                  </div>
                  <div style={{ marginTop:"15px", backgroundColor:colors.bgInput, padding:"12px", borderRadius:"8px" }}>
                    <div style={{ fontSize:"11px", color:colors.textDim, marginBottom:"4px" }}>สัญญาเหลืออีก</div>
                    <div style={{ fontSize:"20px", fontWeight:"bold", color: contractInfo.monthsRemaining <= 2 ? "#ef4444" : "#10b981" }}>{contractInfo.monthsRemaining} เดือน</div>
                    <div style={{ fontSize:"10px", color:colors.textDim, marginTop:"2px" }}>สิ้นสุด {contractInfo.endDate}</div>
                  </div>
                </div>
              </div>

              {/* 🔥 เพิ่มตาราง Payment History สำหรับผู้เช่า กลับเข้ามาแล้ว! */}
              <div style={{ backgroundColor:colors.bgCard, borderRadius:"16px", padding:"25px", border:`1px solid ${colors.border}` }}>
                <h3 style={{ margin:"0 0 20px 0", fontSize:"18px" }}>📖 ประวัติการชำระเงิน (Payment History)</h3>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead>
                    <tr>
                      <TH>รอบบิล</TH><TH>รหัสบิล (Invoice)</TH>
                      <TH>ยอดเงิน (บาท)</TH><TH>TxID</TH><TH>สถานะ</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {mockTenantHistory.map((h, i) => (
                      <tr key={i}>
                        <TD>{h.month}</TD>
                        <TD>{h.invoice}</TD>
                        <TD>{formatBahtOnly(h.amount)}</TD>
                        <TD><a href="#" style={{ color:"#38bdf8", textDecoration:"none" }}>{h.txId}</a></TD>
                        <TD><span style={{ color:"#10b981", fontWeight:"bold" }}>{h.status}</span></TD>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;