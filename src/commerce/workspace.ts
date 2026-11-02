import fs from "node:fs";
import Database from "better-sqlite3";
import {StripeCheckout,type StripeConfig} from "./stripe-checkout.js";

/** Dedicated commerce database; never migrate an arbitrary existing agent database. */
export function openCommerce(file:string,config:StripeConfig,create=false): {db:Database.Database;checkout:StripeCheckout} {
  if(create) {const fd=fs.openSync(file,"wx");fs.closeSync(fd);}
  else {
    const read=new Database(file,{readonly:true,fileMustExist:true});
    try {if(!read.prepare("SELECT 1 FROM commerce_stripe_config WHERE id=1").get()) throw new Error("Not a commerce database");}
    finally {read.close();}
  }
  const db=new Database(file,{fileMustExist:true});
  try {db.pragma("journal_mode = WAL");db.pragma("busy_timeout = 5000");return {db,checkout:new StripeCheckout(db,config)};}
  catch(error){db.close();throw error;}
}
