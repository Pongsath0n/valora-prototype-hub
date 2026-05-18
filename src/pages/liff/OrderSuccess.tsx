export default function OrderSuccessPage(){
 const id=localStorage.getItem('valora:liff:last_order');
 return <div className="max-w-md mx-auto p-4"><h1 className="text-xl font-bold">สั่งซื้อสำเร็จ</h1><p className="text-sm mt-2">Order ID: {id}</p><p className="text-sm mt-1">ระบบได้ส่งข้อความยืนยันไปยัง LINE แล้ว (mock/dev)</p></div>
}
